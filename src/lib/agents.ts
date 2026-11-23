import { streamChat, type ChatMsg, type Chunk } from './ollama';
import type { Agent, AgentRun, Team } from '../store/agents';
import { useUsageStore } from '../store/usage';

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface RunOpts {
  ollamaUrl: string;
  canThink: (modelId: string) => boolean;
  resolveSkill: (dir: string) => Promise<string | undefined>;
  onUpdate: (key: string, patch: Partial<AgentRun>) => void;
}

/** Mensajes de una ejecución: system (rol + skill) + tarea. */
export async function buildAgentMessages(
  agent: Pick<Agent, 'rolePrompt' | 'skill'>,
  task: string,
  resolveSkill: (dir: string) => Promise<string | undefined>,
): Promise<ChatMsg[]> {
  const systemParts: string[] = [];
  if (agent.rolePrompt.trim()) systemParts.push(agent.rolePrompt.trim());
  if (agent.skill) {
    const content = await resolveSkill(agent.skill);
    if (content) systemParts.push(content);
  }
  const messages: ChatMsg[] = [];
  if (systemParts.length > 0) {
    messages.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  messages.push({ role: 'user', content: task });
  return messages;
}

/** Una generación contra Ollama con chunks reportados vía onUpdate(key). */
export async function runGeneration(
  key: string,
  agent: Pick<Agent, 'model'>,
  messages: ChatMsg[],
  opts: RunOpts,
): Promise<void> {
  let thinking = '';
  let content = '';
  const id = uid();
  opts.onUpdate(key, { status: 'generating', model: agent.model });
  try {
    await streamChat(
      {
        id,
        ollamaUrl: opts.ollamaUrl,
        model: agent.model,
        messages,
        think: opts.canThink(agent.model),
      },
      (chunk: Chunk) => {
        if (chunk.type === 'thinking') {
          thinking += chunk.delta;
          opts.onUpdate(key, { thinking });
        } else if (chunk.type === 'content') {
          content += chunk.delta;
          opts.onUpdate(key, { content });
        } else if (chunk.type === 'done') {
          opts.onUpdate(key, { status: 'done', thinkingMs: chunk.thinkingMs });
          useUsageStore.getState().record(
            agent.model,
            chunk.promptTokens ?? 0,
            chunk.completionTokens ?? 0,
          );
        } else if (chunk.type === 'error') {
          opts.onUpdate(key, { status: 'error', error: chunk.message });
        }
      },
    );
  } catch (e) {
    opts.onUpdate(key, { status: 'error', error: String(e) });
  }
}

/** Broadcast: envía la tarea a todos los agentes en paralelo (aislados). */
export async function runBroadcast(
  team: Team,
  message: string,
  opts: RunOpts,
): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(
    team.agents.map(async (agent) => {
      const messages = await buildAgentMessages(agent, message, opts.resolveSkill);
      await runGeneration(agent.id, agent, messages, opts);
    }),
  );
}
