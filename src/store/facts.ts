import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { streamChat } from '../lib/ollama';
import { dedupeFacts, parseFactsReply, recallFacts, type SavedFact } from '../lib/facts';

const FACTS_PROMPT =
  'Tu única tarea es extraer memoria. Lee la conversación y responde SOLO con un array JSON ' +
  '(máximo 3 strings) con los DETALLES RELEVANTES y persistentes que valdría la pena recordar ' +
  '(nombres, decisiones, cifras, preferencias, estado de proyectos). En español, cada hecho una ' +
  'frase completa y autónoma. Sin explicación: solo el array JSON.';

interface FactsState {
  facts: SavedFact[];
  load: () => Promise<void>;
  /** Extrae hechos de una conversación (llamada oculta al modelo) y los guarda. */
  extractAndSave: (
    ollamaUrl: string,
    model: string,
    userText: string,
    reply: string,
    scope: string,
    chatId: string,
  ) => Promise<void>;
  /** Hechos relevantes para una consulta (top N). */
  recall: (query: string, limit?: number) => SavedFact[];
  clear: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function persist(facts: SavedFact[]) {
  try {
    await invoke('facts_save', { data: JSON.stringify(facts) });
  } catch {
    // sin persistencia disponible
  }
}

/** Memoria guardada (v2.6): hechos extraídos del uso real, recall por relevancia. */
export const useFactsStore = create<FactsState>((set, get) => ({
  facts: [],

  load: async () => {
    try {
      const raw = await invoke<string | null>('facts_load');
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        set({
          facts: parsed.filter(
            (f): f is SavedFact =>
              !!f && typeof f === 'object' && typeof (f as SavedFact).text === 'string' && Array.isArray(parsed),
          ),
        });
      }
    } catch {
      // sin persistencia
    }
  },

  extractAndSave: async (ollamaUrl, model, userText, reply, scope, chatId) => {
    if (userText.length + reply.length < 120) return; // intercambios triviales no generan memoria
    let raw = '';
    try {
      await streamChat(
        {
          id: `facts-${Date.now()}`,
          ollamaUrl,
          model,
          think: false,
          messages: [
            { role: 'system', content: FACTS_PROMPT },
            { role: 'user', content: `Usuario: ${userText.slice(0, 2000)}\n\nAsistente: ${reply.slice(0, 2000)}` },
          ],
        },
        (c) => {
          if (c.type === 'content') raw += c.delta;
          if (c.type === 'error') raw = '';
        },
      );
    } catch {
      return;
    }
    const incoming = parseFactsReply(raw);
    if (incoming.length === 0) return;
    set({ facts: dedupeFacts(get().facts, incoming, scope, chatId) });
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(get().facts), 800);
  },

  recall: (query, limit = 5) => recallFacts(get().facts, query, limit),

  clear: () => {
    set({ facts: [] });
    void persist([]);
  },
}));
