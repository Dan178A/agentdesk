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
  loadApiKey: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persist(events: UsageEvent[], sessionBudget: number, weekBudget: number) {
  try {
    await invoke('usage_save', {
      // La API key NO va aquí: vive en el credential manager (credentials.rs).
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
  ollamaApiKey: '',

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

  setApiKey: (key) => {
    const trimmed = key.trim();
    set({ ollamaApiKey: trimmed });
    void invoke('set_ollama_api_key', { key: trimmed }).catch(() => undefined);
    // si había una clave en claro en usage.json (mismo JSON viejo), lo limpia
    const s = get();
    void persist(s.events, s.sessionBudget, s.weekBudget);
  },

  loadApiKey: async () => {
    try {
      const stored = await invoke<string | null>('get_ollama_api_key');
      if (stored) set({ ollamaApiKey: stored });
    } catch {
      // sin credential manager disponible
    }
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
      }));
      // Migración de seguridad (v2.2): usage.json viejos traían la API key en claro →
      // al credential manager y reescritura de usage.json sin el secreto.
      if (typeof parsed.ollamaApiKey === 'string' && parsed.ollamaApiKey.trim()) {
        try {
          await invoke('set_ollama_api_key', { key: parsed.ollamaApiKey.trim() });
          set({ ollamaApiKey: parsed.ollamaApiKey.trim() });
        } catch {
          // sin credential manager: no dejar la clave tampoco en estado de JSON persistido
        }
        const s = get();
        void persist(s.events, s.sessionBudget, s.weekBudget);
      }
    } catch {
      // falla de lectura: se sigue en memoria
    }
  },
}));
