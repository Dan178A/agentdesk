import type { ChatMsg } from './ollama';
import { runGeneration, type RunOpts } from './agents';
import type { Agent, AgentRun, Team } from '../store/agents';
import { LEADER_KEY, SYNTHESIS_KEY } from '../store/agents';

const LEADER_SYSTEM =
  'Eres un orquestador de agentes. Divides una meta en subtareas y las asignas a los agentes del equipo. ' +
  'Responde SOLO con un bloque de código json, sin texto antes ni después, con este formato exacto: ' +
  '{"tareas":[{"agente":"<nombre exacto de un agente del equipo>","prompt":"<subtarea concreta en español>"}]} ' +
  'Reglas: cada subtarea debe ser necesaria para la meta, no repitas agente salvo que aporte valor, máximo una subtarea por agente.';

export function buildLeaderPrompt(team: Team, goal: string): ChatMsg[] {
  const teamList = team.agents
    .map((a) => `- ${a.name}: ${a.rolePrompt || 'agente general'}`)
    .join('\n');
  return [
    { role: 'system', content: LEADER_SYSTEM },
    { role: 'user', content: `Equipo:\n${teamList}\n\nMeta: ${goal}` },
  ];
}

/** Normaliza nombres para matching tolerante (trim, case, guiones). */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ');
}

/** Extrae el JSON de una respuesta: bloque ```json o primer objeto balanceado. */
function extractJson(raw: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  if (fence && fence[1].includes('{')) return fence[1].trim();
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null; // desbalanceado
}

/** Parsea las subtareas del líder; null si inválido o agente inexistente. */
export function parseTasks(
  raw: string,
  team: Team,
): Array<{ agent: Agent; prompt: string }> | null {
  const json = extractJson(raw);
  if (!json) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { tareas?: unknown }).tareas)) {
    return null;
  }
  const tareas = (data as { tareas: unknown[] }).tareas;
  if (tareas.length === 0) return null;
  const out: Array<{ agent: Agent; prompt: string }> = [];
  for (const t of tareas) {
    if (!t || typeof t !== 'object') return null;
    const { agente, prompt } = t as { agente?: unknown; prompt?: unknown };
    if (typeof agente !== 'string' || typeof prompt !== 'string') return null;
    const agent = team.agents.find((a) => norm(a.name) === norm(agente));
    if (!agent) return null;
    out.push({ agent, prompt });
  }
  return out;
}

/** Corre una generación del líder y retorna {ok, content}. */
async function runLeaderOnce(
  messages: ChatMsg[],
  leaderModel: string,
  opts: RunOpts,
): Promise<{ ok: boolean; content: string }> {
  let content = '';
  const state: { status: AgentRun['status'] } = { status: 'idle' };
  const intercept: RunOpts = {
    ...opts,
    onUpdate: (_key, patch) => {
      if (patch.content !== undefined) content = patch.content;
      if (patch.status) state.status = patch.status;
      opts.onUpdate(LEADER_KEY, patch);
    },
  };
  await runGeneration(LEADER_KEY, { model: leaderModel }, messages, intercept);
  return { ok: state.status === 'done', content };
}

function synthesisPrompt(
  results: Array<{ name: string; content: string }>,
  goal: string,
): ChatMsg[] {
  const list = results
    .map((r) => `### ${r.name}\n${r.content || '(sin respuesta)'}`)
    .join('\n\n');
  return [
    {
      role: 'user',
      content: `Resultados:\n${list}\n\nMeta original: ${goal}\nRedacta una respuesta final consolidada en español.`,
    },
  ];
}

/** Orquesta: líder → subtareas → despacho paralelo → síntesis. */
export async function runOrchestrated(
  team: Team,
  goal: string,
  opts: RunOpts,
): Promise<void> {
  const ask = buildLeaderPrompt(team, goal);

  const first = await runLeaderOnce(ask, team.orchestratorModel, opts);
  let tasks = first.ok ? parseTasks(first.content, team) : null;

  if (!tasks) {
    // 1 reintento con corrección (spec §7.4.3)
    const retryMessages: ChatMsg[] = [
      ...ask,
      {
        role: 'user',
        content: `Tu respuesta anterior no era JSON válido o referenciaba agentes inexistentes: ${first.content}\nResponde de nuevo SOLO el bloque JSON con el formato pedido, usando los nombres exactos del equipo.`,
      },
    ];
    const second = await runLeaderOnce(retryMessages, team.orchestratorModel, opts);
    tasks = second.ok ? parseTasks(second.content, team) : null;
    if (!tasks) {
      opts.onUpdate(LEADER_KEY, {
        status: 'error',
        error: 'No se pudieron derivar subtareas — reparte manualmente',
        content: second.content || first.content,
      });
      return;
    }
  }

  // Despacho paralelo con captura de resultados exitosos
  const finalResults = new Map<string, { content: string; status: AgentRun['status'] }>();
  const dispatch = tasks.map(({ agent, prompt }) => {
    opts.onUpdate(agent.id, { subtask: prompt, status: 'pending' });
    const intercept: RunOpts = {
      ...opts,
      onUpdate: (key, patch) => {
        const prev = finalResults.get(key) ?? { content: '', status: 'idle' as const };
        finalResults.set(key, {
          content: patch.content !== undefined ? patch.content : prev.content,
          status: patch.status ?? prev.status,
        });
        opts.onUpdate(key, patch);
      },
    };    return runGeneration(
      agent.id,
      agent,
      [{ role: 'user', content: prompt }],
      intercept,
    );
  });
  await Promise.allSettled(dispatch);

  // Síntesis solo con los exitosos (spec §9)
  const successful = team.agents
    .filter((a) => finalResults.get(a.id)?.status === 'done')
    .map((a) => ({ name: a.name, content: finalResults.get(a.id)?.content ?? '' }));

  if (successful.length === 0) {
    opts.onUpdate(SYNTHESIS_KEY, {
      status: 'error',
      error: 'Ningún agente completó su subtarea',
    });
    return;
  }

  const names = successful.map((s) => s.name);
  const synthesisIntercept: RunOpts = {
    ...opts,
    onUpdate: (_key, patch) => {
      opts.onUpdate(SYNTHESIS_KEY, patch);
    },
  };
  void names;
  await runGeneration(
    SYNTHESIS_KEY,
    { model: team.orchestratorModel },
    synthesisPrompt(successful, goal),
    synthesisIntercept,
  );
}
