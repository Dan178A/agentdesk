import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from './chat';

export interface Project {
  id: string;
  name: string;
}

interface ProjectsState {
  projects: Project[];
  /** Proyectos colapsados en la sidebar (por id). */
  collapsed: Record<string, boolean>;
  load: () => Promise<void>;
  create: (name: string) => Project;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  toggleCollapse: (id: string) => void;
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function persist(projects: Project[]) {
  try {
    await invoke('projects_save', { data: JSON.stringify(projects) });
  } catch {
    // persistencia no disponible: seguimos en memoria
  }
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  collapsed: {},

  load: async () => {
    try {
      const raw = await invoke<string | null>('projects_load');
      const parsed = raw ? (JSON.parse(raw) as Project[]) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        set({ projects: parsed });
        return;
      }
    } catch {
      // falla de lectura: defaults
    }
    const projects = [{ id: 'general', name: 'General' }];
    set({ projects });
    void persist(projects);
  },

  create: (name) => {
    const project: Project = { id: uid(), name: name.trim() || 'Proyecto' };
    const projects = [...get().projects, project];
    set({ projects });
    void persist(projects);
    return project;
  },

  rename: (id, name) => {
    const projects = get().projects.map((p) =>
      p.id === id ? { ...p, name: name.trim() || p.name } : p,
    );
    set({ projects });
    void persist(projects);
  },

  remove: (id) => {
    if (id === 'general') return; // General no se elimina
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    // Los chats del proyecto eliminado vuelven a General (RF-15)
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => (c.projectId === id ? { ...c, projectId: 'general' } : c)),
    }));
    void persist(projects);
  },

  toggleCollapse: (id) => {
    set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } }));
  },
}));
