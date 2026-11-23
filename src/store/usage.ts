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
  record: (model: string, promptTokens: number, completionTokens: number) => void;
  setBudgets: (patch: { sessionBudget?: number; weekBudget?: number }) => void;
  load: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persist(events: UsageEvent[], sessionBudget: number, weekBudget: number) {
  try {
    await invoke('usage_save', {
      data: JSON.stringify({ events, sessionBudget, weekBudget }),
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

  record: (model, promptTokens, completionTokens) => {
    if (promptTokens + completionTokens <= 0) return; // generaciones paradas sin tokens
    set((s) => {
      const events = [...s.events, { ts: Date.now(), model, promptTokens, completionTokens }];
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(
        () => persist(events, get().sessionBudget, get().weekBudget),
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
      void persist(s.events, next.sessionBudget, next.weekBudget);
      return next;
    });
  },

  load: async () => {
    try {
      const raw = await invoke<string | null>('usage_load');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        events?: UsageEvent[];
        sessionBudget?: number;
        weekBudget?: number;
      };
      set((s) => ({
        events: hydrateUsage(parsed.events ? JSON.stringify(parsed.events) : null),
        sessionBudget:
          typeof parsed.sessionBudget === 'number' ? parsed.sessionBudget : s.sessionBudget,
        weekBudget: typeof parsed.weekBudget === 'number' ? parsed.weekBudget : s.weekBudget,
      }));
    } catch {
      // falla de lectura: se sigue en memoria
    }
  },
}));
