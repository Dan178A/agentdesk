import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentsStore } from './agents';
import { useChatStore } from './chat';
import { resetIpc, onInvoke } from '../test/mock-ipc';

beforeEach(() => {
  resetIpc();
  onInvoke('teams_save', async () => {});
  useAgentsStore.setState({ teams: [], activeTeamId: null, runs: {}, view: 'chats' });
  useChatStore.setState({ chats: [], activeChatId: null, isGenerating: false }, false);
  useChatStore.getState().init();
});

describe('store de agentes', () => {
  it('newTeam crea equipo con orquestador default glm-max', () => {
    const t = useAgentsStore.getState().newTeam('Mi equipo');
    expect(t.orchestratorModel).toBe('glm-5.3:cloud');
    expect(useAgentsStore.getState().activeTeamId).toBe(t.id);
  });

  it('addAgent crea agente con defaults (modelo del chat default)', () => {
    const t = useAgentsStore.getState().newTeam('E');
    useAgentsStore.getState().addAgent(t.id);
    const agent = useAgentsStore.getState().teams[0].agents[0];
    expect(agent.model).toBe('glm-5.3-flash:cloud');
    expect(agent.name).toBe('Agente 1');
    expect(agent.rolePrompt).toBe('');
  });

  it('updateAgent cambia campos', () => {
    const t = useAgentsStore.getState().newTeam('E');
    useAgentsStore.getState().addAgent(t.id);
    const agentId = useAgentsStore.getState().teams[0].agents[0].id;
    useAgentsStore.getState().updateAgent(t.id, agentId, {
      name: 'Analista',
      model: 'deepseek-v4.1-flash:cloud',
      rolePrompt: 'Analistas requisitos',
    });
    const agent = useAgentsStore.getState().teams[0].agents[0];
    expect(agent.name).toBe('Analista');
    expect(agent.model).toBe('deepseek-v4.1-flash:cloud');
  });

  it('removeAgent elimina y limpia su run', () => {
    const t = useAgentsStore.getState().newTeam('E');
    useAgentsStore.getState().addAgent(t.id);
    const agentId = useAgentsStore.getState().teams[0].agents[0].id;
    useAgentsStore.getState().setRun(agentId, { status: 'done', content: 'x' });
    useAgentsStore.getState().removeAgent(t.id, agentId);
    expect(useAgentsStore.getState().teams[0].agents.length).toBe(0);
    expect(useAgentsStore.getState().runs[agentId]).toBeUndefined();
  });

  it('resetRuns vuelve todas a idle', () => {
    const t = useAgentsStore.getState().newTeam('E');
    useAgentsStore.getState().addAgent(t.id);
    useAgentsStore.getState().addAgent(t.id);
    const ids = useAgentsStore.getState().teams[0].agents.map((a) => a.id);
    ids.forEach((id) => useAgentsStore.getState().setRun(id, { status: 'done' }));
    useAgentsStore.getState().resetRuns([...ids, 'leader', 'synthesis']);
    expect(Object.keys(useAgentsStore.getState().runs).length).toBe(0);
  });
});
