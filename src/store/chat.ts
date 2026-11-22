import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { streamChat, type ChatMsg, type Chunk } from '../lib/ollama';
import type { ModelUI } from '../lib/models';
import {
  parseFrontmatter,
  buildCatalog,
  type MenuItem,
  type SkillMeta,
  type SkillRaw,
} from '../lib/skills';
import {
  hydrateHistory,
  hydrateSettings,
  serializeChats,
  type Settings,
} from '../lib/persist';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  thinkingMs?: number;
  model?: string;
  skill?: string;
  createdAt: number;
  error?: string;
  stopped?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  model: string;
  projectId: string; // v1.1 (RF-15)
  tokensUsed?: number; // v1.1 (RF-16)
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

let saveTimer: number | null = null;

/** Mensajes que van al modelo: system del skill activo + historial sin placeholder. */
export function buildMessages(chat: Chat): ChatMsg[] {
  const { skillContent } = useChatStore.getState();
  const out: ChatMsg[] = [];
  if (skillContent) out.push({ role: 'system', content: skillContent });
  for (const m of chat.messages) {
    if (m.role === 'system') continue;
    // El placeholder assistant (vacío, sin thinking/error) no se envía al modelo
    const isPlaceholder =
      m.role === 'assistant' && m.content === '' && !m.thinking && !m.error && !m.stopped;
    if (isPlaceholder) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  isGenerating: boolean;
  generationId: string | null;
  pendingStop: boolean;
  ollamaUrl: string;
  defaultModel: string;
  models: ModelUI[];
  skillDir?: string;
  skillContent?: string;
  skillCatalog: MenuItem[];
  init: () => void;
  loadPersisted: () => Promise<void>;
  scheduleSave: () => void;
  loadSkills: () => Promise<void>;
  setActive: (id: string) => void;
  deleteChat: (id: string) => void;
  newChat: (model?: string) => string;
  setModels: (models: ModelUI[]) => void;
  sendMessage: (text: string, model: string) => Promise<void>;
  stopActive: () => void;
  handleChunk: (chunk: Chunk) => void;
  setSkill: (dir: string, content: string) => void;
  clearSkill: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  isGenerating: false,
  generationId: null,
  pendingStop: false,
  ollamaUrl: 'http://localhost:11434',
  defaultModel: 'glm-5.3-flash:cloud',
  models: [],
  skillCatalog: [],

  init: () => {
    void get().loadPersisted();
    if (get().chats.length === 0) get().newChat();
    void get().loadSkills();
  },

  loadPersisted: async () => {
    try {
      const rawSettings = await invoke<string | null>('settings_load');
      const settings: Settings = hydrateSettings(rawSettings);
      useChatStore.setState({ ollamaUrl: settings.ollamaUrl, defaultModel: settings.defaultModel });
      const rawHistory = await invoke<string | null>('history_load');
      const chats = hydrateHistory(rawHistory);
      if (chats.length > 0) {
        useChatStore.setState((s) => ({
          chats: [...chats, ...s.chats],
          activeChatId: s.activeChatId ?? chats[0].id,
        }));
      }
    } catch {
      // persistencia no disponible: se sigue con el chat en memoria
    }
  },

  loadSkills: async () => {
    try {
      const raws = await invoke<SkillRaw[]>('list_skills');
      const metas = raws
        .map(parseFrontmatter)
        .filter((m): m is SkillMeta => m !== null);
      set({ skillCatalog: buildCatalog(metas) });
    } catch {
      set({ skillCatalog: buildCatalog([]) }); // solo built-ins
    }
  },

  newChat: (model) => {
    const chat: Chat = {
      id: uid(),
      title: 'Chat nuevo',
      model: model ?? get().defaultModel,
      projectId: 'general',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({ chats: [chat, ...s.chats], activeChatId: chat.id }));
    return chat.id;
  },

  setModels: (models) => set({ models }),

  sendMessage: async (text, model) => {
    const s = get();
    if (s.isGenerating) return; // Review Focus 2: no doble generación
    const chat = s.chats.find((c) => c.id === s.activeChatId);
    if (!chat || !text.trim()) return;

    const now = Date.now();
    const userMsg: ChatMessage = { role: 'user', content: text, createdAt: now };
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      thinking: '',
      model,
      skill: s.skillDir,
      createdAt: now,
    };
    const isNewTitle = chat.title === 'Chat nuevo';
    const updatedChat: Chat = {
      ...chat,
      title: isNewTitle ? text.slice(0, 40) : chat.title,
      messages: [...chat.messages, userMsg, assistantMsg],
      updatedAt: now,
    };
    set((st) => ({
      chats: st.chats.map((c) => (c.id === chat.id ? updatedChat : c)),
      isGenerating: true,
    }));

    const id = uid();
    set({ generationId: id });
    const modelInfo = s.models.find((m) => m.id === model);
    const think = modelInfo ? modelInfo.canThink : true; // spec §7.1
    try {
      await streamChat(
        { id, ollamaUrl: s.ollamaUrl, model, messages: buildMessages(updatedChat), think },
        (c) => get().handleChunk(c),
      );
    } catch (e) {
      get().handleChunk({ type: 'error', id, message: String(e) });
    }
  },

  stopActive: () => {
    const s = get();
    if (!s.isGenerating || !s.generationId) return;
    set({ pendingStop: true });
    void invoke('chat_stop', { id: s.generationId });
  },

  handleChunk: (chunk) => {
    const s = get();
    if (chunk.id !== s.generationId) return;
    const chatId = s.activeChatId;
    const finished = chunk.type === 'done' || chunk.type === 'error';
    set((st) => ({
      chats: st.chats.map((c) => {
        if (c.id !== chatId) return c;
        const msgs = [...c.messages];
        const i = msgs.length - 1;
        if (i < 0) return c;
        const m = { ...msgs[i] };
        if (chunk.type === 'thinking') m.thinking = (m.thinking ?? '') + chunk.delta;
        if (chunk.type === 'content') m.content = (m.content ?? '') + chunk.delta;
        if (chunk.type === 'done') {
          m.thinkingMs = chunk.thinkingMs;
          if (st.pendingStop) m.stopped = true;
        }
        if (chunk.type === 'error') m.error = chunk.message;
        msgs[i] = m;
        return { ...c, messages: msgs, updatedAt: Date.now() };
      }),
      isGenerating: !finished,
      generationId: finished ? null : st.generationId,
      pendingStop: chunk.type === 'done' ? false : st.pendingStop,
    }));
    if (finished) void get().scheduleSave();
  },

  scheduleSave: () => {
    // Debounce 800ms: agrupar done/error y guardados seguidos
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void invoke('history_save', { data: serializeChats(useChatStore.getState().chats) }).catch(
        () => undefined,
      );
    }, 800) as unknown as number;
  },

  setActive: (id) => {
    const chat = get().chats.find((c) => c.id === id);
    if (chat) set({ activeChatId: id });
  },

  deleteChat: (id) => {
    set((s) => {
      const chats = s.chats.filter((c) => c.id !== id);
      const activeChatId =
        s.activeChatId === id ? (chats[0]?.id ?? null) : s.activeChatId;
      return { chats, activeChatId };
    });
    if (get().chats.length === 0) get().newChat();
    void get().scheduleSave();
  },

  setSkill: (dir, content) => set({ skillDir: dir, skillContent: content }),

  clearSkill: () => set({ skillDir: undefined, skillContent: undefined }),
}));
