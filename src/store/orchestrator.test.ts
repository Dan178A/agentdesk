import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseTasks, buildLeaderPrompt, runOrchestrated } from '../lib/orchestrator';
import type { Team, AgentRun } from '../store/agents';
import { LEADER_KEY, SYNTHESIS_KEY } from '../store/agents';
import { resetIpc, onInvoke, ipcCalls } from '../test/mock-ipc';
import type { Chunk } from '../lib/ollama';

const TEAM: Team = {
  id: 't',
  name: 'T',
  orchestratorModel: 'glm-5.3:cloud',
  agents: [
    { id: 'a1', name: 'Analista', model: 'glm-5.3-flash:cloud', rolePrompt: 'Analiza' },
    { id: 'a2', name: 'Diseñador', model: 'glm-5.3-flash:cloud', rolePrompt: 'Diseña' },
  ],
};

describe('parseTasks (Review Focus 5)', () => {
  it('JSON limpio → asignaciones en orden', () => {
    const raw = '{"tareas":[{"agente":"Analista","prompt":"Revisa el brief"},{"agente":"Diseñador","prompt":"Propón layout"}]}';
    const r = parseTasks(raw, TEAM);
    expect(r).not.toBeNull();
    expect(r!.map((t) => t.agent.id)).toEqual(['a1', 'a2']);
    expect(r![0].prompt).toBe('Revisa el brief');
  });

  it('bloque ```json con ruido alrededor → parsea igual', () => {
    const raw = 'Claro:\n```json\n{"tareas":[{"agente":"Analista","prompt":"x"}]}\n```\nListo.';
    expect(parseTasks(raw, TEAM)?.length).toBe(1);
  });

  it('objeto balanceado sin fence → parsea', () => {
    const raw = 'aquí va: {"tareas":[{"agente":"Diseñador","prompt":"y"}]} y listo';
    expect(parseTasks(raw, TEAM)?.[0].agent.id).toBe('a2');
  });

  it('JSON malformado → null', () => {
    expect(parseTasks('{"tareas": [roto', TEAM)).toBeNull();
  });

  it('agente inexistente → null', () => {
    const raw = '{"tareas":[{"agente":"Ghost","prompt":"x"}]}';
    expect(parseTasks(raw, TEAM)).toBeNull();
  });

  it('matching trim + case-insensitive + guiones (Analista Senior)', () => {
    const team2: Team = {
      ...TEAM,
      agents: [{ id: 'x', name: 'analista senior', model: 'm', rolePrompt: '' }],
    };
    const raw = '{"tareas":[{"agente":"  Analista-Senior ","prompt":"x"}]}';
    expect(parseTasks(raw, team2)?.[0].agent.id).toBe('x');
  });

  it('cero tareas → null', () => {
    expect(parseTasks('{"tareas":[]}', TEAM)).toBeNull();
  });
});

describe('buildLeaderPrompt', () => {
  it('system con el contrato y user con equipo + meta', () => {
    const msgs = buildLeaderPrompt(TEAM, 'Hacer un landing page');
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('tareas');
    expect(msgs[0].content).toContain('json');
    expect(msgs[1].content).toContain('- Analista: Analiza');
    expect(msgs[1].content).toContain('- Diseñador: Diseña');
    expect(msgs[1].content).toContain('Meta: Hacer un landing page');
  });
});

const OPTS = {
  ollamaUrl: 'http://localhost:11434',
  canThink: () => true,
  resolveSkill: async () => undefined,
};

beforeEach(() => {
  resetIpc();
});

describe('runOrchestrated', () => {
  it('líder válido → subtareas en paralelo + síntesis con los exitosos', async () => {
    const leaderJson =
      '{"tareas":[{"agente":"Analista","prompt":"tarea A"},{"agente":"Diseñador","prompt":"tarea B"}]}';
    const synthesisCalls: string[] = [];
    onInvoke('chat_start', async (args) => {
      const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      const model = args.model as string;
      const messages = args.messages as Array<{ role: string; content: string }>;
      if (model === 'glm-5.3:cloud' && messages[messages.length - 1].content.includes('Resultados')) {
        synthesisCalls.push(messages[messages.length - 1].content);
        ch.onmessage?.({ type: 'content', id: args.id as string, delta: 'síntesis final' });
        ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 2 });
        return;
      }
      if (model === 'glm-5.3:cloud') {
        ch.onmessage?.({ type: 'content', id: args.id as string, delta: leaderJson });
        ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 5 });
        return;
      }
      const task = messages[messages.length - 1].content;
      ch.onmessage?.({ type: 'content', id: args.id as string, delta: `hecho: ${task}` });
      ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 1 });
    });

    const runs: Record<string, AgentRun> = {};
    const onUpdate = (key: string, patch: Partial<AgentRun>) => {
      runs[key] = { ...(runs[key] ?? { status: 'idle' }), ...patch };
    };
    await runOrchestrated(TEAM, 'construye la landing', { ...OPTS, onUpdate });

    expect(runs['a1']).toMatchObject({ status: 'done', subtask: 'tarea A', content: 'hecho: tarea A' });
    expect(runs['a2']).toMatchObject({ status: 'done', subtask: 'tarea B' });
    expect(runs[LEADER_KEY]).toMatchObject({ status: 'done' });
    expect(runs[SYNTHESIS_KEY]).toMatchObject({ status: 'done', content: 'síntesis final' });
    // la síntesis recibió los resultados de ambos agentes + la meta
    expect(synthesisCalls[0]).toContain('hecho: tarea A');
    expect(synthesisCalls[0]).toContain('Meta original: construye la landing');
    // subtareas despachadas en paralelo: 1 líder (pedir) + 2 agentes + 1 síntesis
    expect(ipcCalls().filter((c) => c.cmd === 'chat_start').length).toBe(4);
  });

  it('JSON malformado → retry con corrección; 2º fallo → error con texto crudo (spec §7.4.3)', async () => {
    const leaderAsks: string[] = [];
    onInvoke('chat_start', async (args) => {
      const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      const model = args.model as string;
      if (model !== 'glm-5.3:cloud') return;
      const messages = args.messages as Array<{ role: string; content: string }>;
      leaderAsks.push(messages[messages.length - 1].content);
      ch.onmessage?.({ type: 'content', id: args.id as string, delta: 'no soy json' });
      ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 5 });
    });

    const runs: Record<string, AgentRun> = {};
    const onUpdate = (key: string, patch: Partial<AgentRun>) => {
      runs[key] = { ...(runs[key] ?? { status: 'idle' }), ...patch };
    };
    await runOrchestrated(TEAM, 'meta', { ...OPTS, onUpdate });

    // 2 llamadas al líder: original + retry con corrección
    expect(leaderAsks.length).toBe(2);
    expect(leaderAsks[1]).toContain('no era JSON válido');
    // tarjeta líder en error con el texto crudo
    expect(runs[LEADER_KEY]).toMatchObject({ status: 'error' });
    expect(runs[LEADER_KEY]?.content).toContain('no soy json');
  });

  it('un agente falla → la síntesis procede solo con los exitosos (spec §9)', async () => {
    const leaderJson = '{"tareas":[{"agente":"Analista","prompt":"t1"},{"agente":"Diseñador","prompt":"t2"}]}';
    const synthesisTexts: string[] = [];
    onInvoke('chat_start', async (args) => {
      const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      const model = args.model as string;
      const messages = args.messages as Array<{ role: string; content: string }>;
      const last = messages[messages.length - 1].content;
      if (model === 'glm-5.3:cloud' && last.includes('Resultados')) {
        synthesisTexts.push(last);
        ch.onmessage?.({ type: 'content', id: args.id as string, delta: 'consolidado' });
        ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 2 });
        return;
      }
      if (model === 'glm-5.3:cloud') {
        ch.onmessage?.({ type: 'content', id: args.id as string, delta: leaderJson });
        ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 5 });
        return;
      }
      if (last === 't2') {
        ch.onmessage?.({ type: 'error', id: args.id as string, message: 'caída' });
        return;
      }
      ch.onmessage?.({ type: 'content', id: args.id as string, delta: 'ok t1' });
      ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 1 });
    });

    const runs: Record<string, AgentRun> = {};
    const onUpdate = (key: string, patch: Partial<AgentRun>) => {
      runs[key] = { ...(runs[key] ?? { status: 'idle' }), ...patch };
    };
    await runOrchestrated(TEAM, 'meta', { ...OPTS, onUpdate });

    expect(runs['a2']).toMatchObject({ status: 'error' });
    expect(runs[SYNTHESIS_KEY]).toMatchObject({ status: 'done', content: 'consolidado' });
    // la síntesis solo recibió el resultado exitoso
    expect(synthesisTexts[0]).toContain('ok t1');
    expect(synthesisTexts[0]).not.toContain('t2');
  });
});
