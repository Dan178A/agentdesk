import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  hydrateUsage,
  DEFAULT_SESSION_BUDGET,
  DEFAULT_WEEK_BUDGET,
  type UsageEvent,
} from '../lib/usage';

interface UsageState {
  events: UsageEvent[];
  /** Inicio de la sesión de la app (al cargar la página). */
  sessionStart: number;
  sessionBudget: number;
  weekBudget: number;
  /** API key de ollama.com (Settings › Keys) para el uso en nube. */
  ollamaApiKey: string;
  record: (model: string, promptTokens: number, completionTokens: number) => void;
  setBudgets: (patch: { sessionBudget?: number; weekBudget?: number }) => void;
  setApiKey: (key: string) => void;
  load: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persist(
  events: UsageEvent[],
  sessionBudget: number,
  weekBudget: number,
  ollamaApiKey: string,
) {
  try {
    await invoke('usage_save', {
      data: JSON.stringify({ events, sessionBudget, weekBudget, ollamaApiKey }),
    });
  } catch {
    // sin persistencia disponible
  }
}

/** Registro de uso por modelo (v2.1): alimenta anillos y dashboard. */
export const useUsageStore = create<UsageState>((set, get) => ({
  events: [],
  sessionStart: Date.now(),
  sessionBudget: DEFAULT_SESSION_BUDGET,
  weekBudget: DEFAULT_WEEK_BUDGET,
  ollamaApiKey: '',

  record: (model, promptTokens, completionTokens) => {
    if (promptTokens + completionTokens <= 0) return; // generaciones paradas sin tokens
    set((s) => {
      const events = [...s.events, { ts: Date.now(), model, promptTokens, completionTokens }];
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(
        () => persist(events, get().sessionBudget, get().weekBudget, get().ollamaApiKey),
        800,
      );
      return { events };
    });
  },

  setBudgets: (patch) => {
    set((s) => {
      const next = {
        sessionBudget: patch.sessionBudget ?? s.sessionBudget,
        weekBudget: patch.weekBudget ?? s.weekBudget,
      };
      void persist(s.events, next.sessionBudget, next.weekBudget, s.ollamaApiKey);
      return next;
    });
  },

  setApiKey: (key) => {
    set({ ollamaApiKey: key.trim() });
    const s = get();
    void persist(s.events, s.sessionBudget, s.weekBudget, s.ollamaApiKey);
  },

  load: async () => {
    try {
      const raw = await invoke<string | null>('usage_load');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        events?: UsageEvent[];
        sessionBudget?: number;
        weekBudget?: number;
        ollamaApiKey?: string;
      };
      set((s) => ({
        events: hydrateUsage(parsed.events ? JSON.stringify(parsed.events) : null),
        sessionBudget:
          typeof parsed.sessionBudget === 'number' ? parsed.sessionBudget : s.sessionBudget,
        weekBudget: typeof parsed.weekBudget === 'number' ? parsed.weekBudget : s.weekBudget,
        ollamaApiKey: typeof parsed.ollamaApiKey === 'string' ? parsed.ollamaApiKey : s.ollamaApiKey,
      }));
    } catch {
      // falla de lectura: se sigue en memoria
    }
  },
}));
