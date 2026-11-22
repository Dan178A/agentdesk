import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { runBroadcast } from '../lib/agents';
import type { Team, AgentRun } from './agents';
import { resetIpc, onInvoke, ipcCalls } from '../test/mock-ipc';
import type { Chunk } from '../lib/ollama';

function teamFixture(): Team {
  return {
    id: 't',
    name: 'T',
    orchestratorModel: 'glm-5.3:cloud',
    agents: [
      { id: 'a1', name: 'Analista', model: 'glm-5.3-flash:cloud', rolePrompt: 'Analiza requisitos' },
      { id: 'a2', name: 'Dev', model: 'deepseek-v4.1-flash:cloud', rolePrompt: 'Codifica', skill: 'ui-styling' },
      { id: 'a3', name: 'Crítico', model: 'gemma3:4b', rolePrompt: '' },
    ],
  };
}

const OPTS = {
  ollamaUrl: 'http://localhost:11434',
  canThink: (m: string) => m !== 'gemma3:4b',
  resolveSkill: async (dir: string) => (dir === 'ui-styling' ? 'CONTENIDO SKILL' : undefined),
};

beforeEach(() => {
  resetIpc();
});

describe('runBroadcast (Task 13)', () => {
  it('un chat_start por agente con system de rol + skill y think por capability', async () => {
    const runs: Record<string, AgentRun> = {};
    const onUpdate = (id: string, patch: Partial<AgentRun>) => {
      runs[id] = { ...(runs[id] ?? { status: 'idle' }), ...patch };
    };
    const emissions: Array<(c: Chunk) => void> = [];
    onInvoke('chat_start', async (args) => {
      const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      emissions.push((c) => ch.onmessage?.({ ...c, id: args.id as string }));
    });

    await runBroadcast(teamFixture(), 'construye una landing', {
      ...OPTS,
      onUpdate,
    });

    const starts = ipcCalls().filter((c) => c.cmd === 'chat_start');
    expect(starts.length).toBe(3);

    const a2 = starts.find(
      (c) => (c.args.model as string) === 'deepseek-v4.1-flash:cloud',
    )!;
    const a1 = starts.find((c) => (c.args.model as string) === 'glm-5.3-flash:cloud')!;
    const a3 = starts.find((c) => (c.args.model as string) === 'gemma3:4b')!;

    // a2: system con rol y skill
    const a2msgs = a2.args.messages as Array<{ role: string; content: string }>;
    expect(a2msgs[0].role).toBe('system');
    expect(a2msgs[0].content).toContain('Codifica');
    expect(a2msgs[0].content).toContain('CONTENIDO SKILL');
    expect(a2.args.think).toBe(true);
    // a1: system solo con rol
    const a1msgs = a1.args.messages as Array<{ role: string; content: string }>;
    expect(a1msgs[0].content).toContain('Analiza requisitos');
    // a3: sin role ni skill → sin system; y think false (sin capability)
    const a3msgs = a3.args.messages as Array<{ role: string; content: string }>;
    expect(a3msgs[0].role).toBe('user');
    expect(a3.args.think).toBe(false);
  });

  it('los chunks enrutados por generación aislada y un fallo no tumba al resto (spec §9)', async () => {
    const runs: Record<string, AgentRun> = {};
    const onUpdate = (id: string, patch: Partial<AgentRun>) => {
      runs[id] = { ...(runs[id] ?? { status: 'idle' }), ...patch };
    };
    const team = teamFixture();
    onInvoke('chat_start', async (args) => {
      const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      const model = args.model as string;
      const agentId =
        model === 'glm-5.3-flash:cloud' ? 'a1' : model === 'deepseek-v4.1-flash:cloud' ? 'a2' : 'a3';
      if (agentId === 'a3') {
        ch.onmessage?.({ type: 'error', id: args.id as string, message: 'conexión caída' });
        return;
      }
      ch.onmessage?.({ type: 'thinking', id: args.id as string, delta: 'razonando…' });
      ch.onmessage?.({ type: 'content', id: args.id as string, delta: `respuesta de ${agentId}` });
      ch.onmessage?.({ type: 'done', id: args.id as string, thinkingMs: 42 });
    });

    await runBroadcast(team, 'hagan su parte', { ...OPTS, onUpdate });

    expect(runs['a1']).toMatchObject({ status: 'done', content: 'respuesta de a1', thinking: 'razonando…' });
    expect(runs['a2']).toMatchObject({ status: 'done', content: 'respuesta de a2' });
    expect(runs['a3']).toMatchObject({ status: 'error', error: 'conexión caída' });
    // a3 no recibió thinking de otros agentes (aislamiento)
    expect(runs['a3']?.thinking).toBeUndefined();
  });
});
