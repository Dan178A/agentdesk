import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Agent {
  id: string;
  name: string;
  model: string;
  skill?: string;
  rolePrompt: string;
}

export interface Team {
  id: string;
  name: string;
  agents: Agent[];
  orchestratorModel: string;
}

export type RunStatus = 'idle' | 'pending' | 'generating' | 'done' | 'error' | 'stopped';

export interface AgentRun {
  status: RunStatus;
  thinking?: string;
  thinkingMs?: number;
  content?: string;
  error?: string;
  subtask?: string;
  model?: string;
}

export const LEADER_KEY = '__leader__';
export const SYNTHESIS_KEY = '__synthesis__';

interface AgentsState {
  teams: Team[];
  activeTeamId: string | null;
  runs: Record<string, AgentRun>;
  view: 'chats' | 'agents' | 'usage';
  setView: (view: 'chats' | 'agents' | 'usage') => void;
  newTeam: (name: string) => Team;
  addAgent: (teamId: string) => Agent;
  updateAgent: (teamId: string, agentId: string, patch: Partial<Agent>) => void;
  removeAgent: (teamId: string, agentId: string) => void;
  setRun: (key: string, patch: Partial<AgentRun>) => void;
  resetRuns: (keys: string[]) => void;
  setActiveTeam: (teamId: string) => void;
  loadTeams: () => Promise<void>;
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function persist(teams: Team[]) {
  try {
    await invoke('teams_save', { data: JSON.stringify(teams) });
  } catch {
    // sin persistencia disponible
  }
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  teams: [],
  activeTeamId: null,
  runs: {},
  view: 'chats',

  setView: (view) => set({ view }),

  newTeam: (name) => {
    const team: Team = {
      id: uid(),
      name: name.trim() || 'Equipo',
      agents: [],
      orchestratorModel: 'glm-5.3:cloud',
    };
    set((s) => ({ teams: [...s.teams, team], activeTeamId: team.id }));
    void persist(get().teams);
    return team;
  },

  addAgent: (teamId) => {
    const team = get().teams.find((t) => t.id === teamId);
    const agent: Agent = {
      id: uid(),
      name: `Agente ${team ? team.agents.length + 1 : 1}`,
      model: 'glm-5.3-flash:cloud',
      rolePrompt: '',
    };
    set((s) => ({
      teams: s.teams.map((t) => (t.id === teamId ? { ...t, agents: [...t.agents, agent] } : t)),
    }));
    void persist(get().teams);
    return agent;
  },

  updateAgent: (teamId, agentId, patch) => {
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              agents: t.agents.map((a) => (a.id === agentId ? { ...a, ...patch } : a)),
            }
          : t,
      ),
    }));
    void persist(get().teams);
  },

  removeAgent: (teamId, agentId) => {
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === teamId ? { ...t, agents: t.agents.filter((a) => a.id !== agentId) } : t,
      ),
      runs: Object.fromEntries(Object.entries(s.runs).filter(([k]) => k !== agentId)),
    }));
    void persist(get().teams);
  },

  setRun: (key, patch) => {
    set((s) => {
      const base: AgentRun = s.runs[key] ?? { status: 'idle' };
      return { runs: { ...s.runs, [key]: { ...base, ...patch } } };
    });
  },

  resetRuns: (keys) => {
    set((s) => {
      const runs = { ...s.runs };
      for (const k of keys) delete runs[k];
      return { runs };
    });
  },

  setActiveTeam: (teamId) => {
    if (get().teams.some((t) => t.id === teamId)) set({ activeTeamId: teamId });
  },

  loadTeams: async () => {
    try {
      const raw = await invoke<string | null>('teams_load');
      const parsed = raw ? (JSON.parse(raw) as Team[]) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        set({ teams: parsed, activeTeamId: parsed[0].id });
        return;
      }
    } catch {
      // falla de lectura: sin equipos
    }
    if (get().teams.length === 0) get().newTeam('Equipo 1');
  },
}));
