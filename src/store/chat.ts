import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { streamChat, generateTitle, type ChatMsg, type Chunk } from '../lib/ollama';
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
import { extractPreview } from '../lib/preview';
import { usePreviewStore } from './preview';
import { useUsageStore } from './usage';
import { useMemoryStore, buildMemorySystem } from './memory';
import { readFilesInFolder } from '../lib/fsFiles';
import { buildFolderSystem, type FolderRoot } from '../lib/folderContext';
import { useProjectsStore } from './projects';
import { useFactsStore } from './facts';
import { buildFactsSystem } from '../lib/facts';
import {
  AGENT_SYSTEM_PROMPT,
  describeCall,
  executeTool,
  extractToolCalls,
  needsConfirmation,
  type ToolCall,
} from '../lib/tools';

/** Marcador de resultados de herramientas en el historial (v2.7). */
export const TOOL_RESULT_MARKER = '[Resultados de herramientas]';
const MAX_AGENT_ROUNDS = 8;

export interface ToolLogEntry {
  label: string;
  ok: boolean;
  output: string;
  ts: number;
}

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

/** Mensajes que van al modelo: memoria + skill + carpetas + historial sin placeholder. */
export function buildMessages(chat: Chat, memory = '', folderContext = ''): ChatMsg[] {
  const { skillContent } = useChatStore.getState();
  const out: ChatMsg[] = [];
  if (memory) out.push({ role: 'system', content: memory });
  if (skillContent) out.push({ role: 'system', content: skillContent });
  if (folderContext) out.push({ role: 'system', content: folderContext });
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
  /** Carpetas adjuntas al próximo envío (chips arriba del input, v2.5). */
  pendingFolders: FolderRoot[];
  addFolder: (path: string) => Promise<void>;
  removeFolder: (path: string) => void;
  /** Modo agente (v2.7): bucle pensar → herramientas → pensar. */
  agentMode: boolean;
  toggleAgentMode: () => void;
  /** Terminal del agente (v2.7): registro de ejecuciones y salidas. */
  toolLog: ToolLogEntry[];
  /** Comando en espera de autorización (bucle pausado). */
  pendingCommand: ToolCall | null;
  queuedCommands: ToolCall[];
  agentRounds: number;
  /** Contexto del turno de agente actual (system combinado + carpeta), para reanudar. */
  agentSystemCtx: string;
  agentFolderCtx: string;
  confirmCommand: (allow: boolean) => Promise<void>;
  init: () => void;
  loadPersisted: () => Promise<void>;
  scheduleSave: () => void;
  loadSkills: () => Promise<void>;
  setActive: (id: string) => void;
  deleteChat: (id: string) => void;
  retryLast: () => Promise<void>;
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
  pendingFolders: [],
  agentMode: false,
  toolLog: [],
  pendingCommand: null,
  queuedCommands: [],
  agentRounds: 0,
  agentSystemCtx: '',
  agentFolderCtx: '',

  addFolder: async (path) => {
    const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
    try {
      const files = await readFilesInFolder(path);
      set((s) => ({
        pendingFolders: [...s.pendingFolders.filter((f) => f.path !== path), { path, name, files }],
      }));
    } catch {
      set((s) => ({
        pendingFolders: [...s.pendingFolders.filter((f) => f.path !== path), { path, name, files: [] }],
      }));
    }
  },

  removeFolder: (path) =>
    set((s) => ({ pendingFolders: s.pendingFolders.filter((f) => f.path !== path) })),

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

  toggleAgentMode: () => set((s) => ({ agentMode: !s.agentMode })),

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
    // Memoria integrada (v2.4): fichas del usuario como system prompt permanente
    const memory = useMemoryStore.getState().active
      ? buildMemorySystem(useMemoryStore.getState().files)
      : '';
    // Carpetas adjuntas (v2.5): el sistema busca en ellas según la consulta y se limpian al enviar
    const folders = get().pendingFolders;
    // Carpeta vinculada del proyecto (v2.6): contexto automático, persistente, sin chip
    const projectRoot = await useProjectsStore.getState().getContext(chat.projectId);
    const allRoots = projectRoot ? [...folders, projectRoot] : folders;
    const folderContext = allRoots.length > 0 ? buildFolderSystem(allRoots, text) : '';
    if (folders.length > 0) set({ pendingFolders: [] });
    // Hechos guardados (v2.6): los relevantes para esta consulta, como system extra
    const recalled = useFactsStore.getState().recall(text);
    const factsSystem = buildFactsSystem(recalled);
    const folderAndFacts = [folderContext, factsSystem].filter(Boolean).join('\n\n');
    const agentPrompt = s.agentMode ? AGENT_SYSTEM_PROMPT : '';
    const combinedSystem = [agentPrompt, memory].filter(Boolean).join('\n\n');
    if (s.agentMode) {
      set({
        agentRounds: 0,
        queuedCommands: [],
        pendingCommand: null,
        agentSystemCtx: combinedSystem,
        agentFolderCtx: folderAndFacts,
      });
      await runAgentTurn(chat.id, model, id);
    } else {
      try {
        await streamChat(
          {
            id,
            ollamaUrl: s.ollamaUrl,
            model,
            messages: buildMessages(updatedChat, combinedSystem, folderAndFacts),
            think,
          },
          (c) => get().handleChunk(c),
        );
      } catch (e) {
        get().handleChunk({ type: 'error', id, message: String(e) });
      }
    }
    void postTurn(chat.id, model, text);
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
        return {
          ...c,
          messages: msgs,
          tokensUsed:
            chunk.type === 'done'
              ? (chunk.promptTokens ?? 0) + (chunk.completionTokens ?? 0)
              : c.tokensUsed,
          updatedAt: Date.now(),
        };
      }),
      isGenerating: !finished,
      generationId: finished ? null : st.generationId,
      pendingStop: chunk.type === 'done' ? false : st.pendingStop,
    }));
    if (finished) void get().scheduleSave();
    // Registro de uso (v2.1): tokens del done hacia el medidor
    if (chunk.type === 'done') {
      const model = useChatStore
        .getState()
        .chats.find((x) => x.id === chatId)?.messages.slice(-1)[0]?.model;
      useUsageStore.getState().record(
        model ?? 'desconocido',
        chunk.promptTokens ?? 0,
        chunk.completionTokens ?? 0,
      );
    }
    // Creador de interfaces (v2.0 Fase 4): al terminar, abre el HTML en el panel
    if (s.skillDir === 'interfaz' && chunk.type === 'done') {
      const c = useChatStore.getState().chats.find((x) => x.id === chatId);
      const last = c?.messages[c.messages.length - 1];
      const preview = last ? extractPreview(last.content) : null;
      if (preview && preview.kind === 'html') usePreviewStore.getState().show(preview);
    }
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
    // ISSUE-002 (/qa 2026-11-22): al borrar el chat activo prefiere un chat del
    // MISMO proyecto; si era el último, crea el reemplazo en ese proyecto.
    const s = get();
    const removed = s.chats.find((c) => c.id === id);
    let chatsNext = s.chats.filter((c) => c.id !== id);
    let activeNext = s.activeChatId;
    if (removed && s.activeChatId === id) {
      const sameProject = chatsNext
        .filter((c) => c.projectId === removed.projectId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (sameProject) {
        activeNext = sameProject.id;
      } else {
        const fresh: Chat = {
          id: uid(),
          title: 'Chat nuevo',
          model: removed.model,
          projectId: removed.projectId,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        chatsNext = [fresh, ...chatsNext];
        activeNext = fresh.id;
      }
    }
    set({ chats: chatsNext, activeChatId: activeNext });
    if (get().chats.length === 0) get().newChat();
    void get().scheduleSave();
  },

  retryLast: async () => {
    const s = get();
    if (s.isGenerating) return;
    const chat = s.chats.find((c) => c.id === s.activeChatId);
    if (!chat) return;
    let lastUserIdx = -1;
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      if (chat.messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const userContent = chat.messages[lastUserIdx].content;
    set((st) => ({
      chats: st.chats.map((c) =>
        c.id === chat.id
          ? { ...c, messages: c.messages.slice(0, lastUserIdx), updatedAt: Date.now() }
          : c,
      ),
    }));
    await get().sendMessage(userContent, chat.model);
  },

  setSkill: (dir, content) => set({ skillDir: dir, skillContent: content }),

  clearSkill: () => set({ skillDir: undefined, skillContent: undefined }),

  confirmCommand: (allow) => confirmAction(allow),
}));

/** Bucle del modo agente (v2.7): stream → herramientas → resultados → repetir.
 * Se pausa cuando hay comandos por autorizar y lo reanuda confirmCommand. */
async function runAgentTurn(
  chatId: string,
  model: string,
  generationId: string,
): Promise<void> {
  const store = useChatStore;
  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    const s = store.getState();
    if (s.pendingStop) break;
    const chat = s.chats.find((c) => c.id === chatId);
    if (!chat) break;
    ensureAssistantPlaceholder(chatId);
    setGenerating(generationId);
    try {
      await streamChat(
        {
          id: generationId,
          ollamaUrl: s.ollamaUrl,
          model,
          think: s.models.find((m) => m.id === model)?.canThink ?? true,
          messages: buildMessages(chat, s.agentSystemCtx, s.agentFolderCtx),
        },
        (c) => store.getState().handleChunk(c),
      );
    } catch (e) {
      store.getState().handleChunk({ type: 'error', id: generationId, message: String(e) });
      break;
    }
    const after = store.getState().chats.find((c) => c.id === chatId);
    const reply = after?.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? '';
    if (store.getState().pendingStop) break;
    const calls = extractToolCalls(reply);
    if (calls.length === 0) break; // respuesta final: turno terminado
    const results: { label: string; ok: boolean; output: string }[] = [];
    const deferred: ToolCall[] = [];
    for (const call of calls) {
      if (needsConfirmation(call)) {
        deferred.push(call);
        continue;
      }
      const r = await executeTool(call);
      results.push({ label: describeCall(call), ok: r.ok, output: r.output });
    }
    if (deferred.length > 0) {
      setGenerating(generationId); // queda en "generando" hasta que el usuario autorice
      store.setState({ pendingCommand: deferred[0], queuedCommands: deferred.slice(1) });
      return;
    }
    if (results.length === 0) break;
    appendToolResults(chatId, results);
  }
  if (store.getState().pendingStop) store.setState({ pendingStop: false });
}

function setGenerating(generationId: string) {
  useChatStore.setState({ isGenerating: true, generationId, pendingStop: false });
}

function ensureAssistantPlaceholder(chatId: string) {
  const st = useChatStore.getState();
  const chat = st.chats.find((c) => c.id === chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  const alreadyPlaceholder =
    last && last.role === 'assistant' && !last.content && !last.thinking && !last.error;
  if (alreadyPlaceholder) return;
  const now = Date.now();
  useChatStore.setState((s) => ({
    chats: s.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            messages: [
              ...c.messages,
              { role: 'assistant' as const, content: '', thinking: '', model: '', createdAt: now },
            ],
          }
        : c,
    ),
  }));
}

function appendToolResults(chatId: string, results: { label: string; ok: boolean; output: string }[]) {
  const content =
    TOOL_RESULT_MARKER +
    '\n' +
    results.map((r) => `${r.label} → ${r.ok ? 'ok' : 'error'}:\n${r.output}`).join('\n\n');
  const now = Date.now();
  useChatStore.setState((s) => ({
    chats: s.chats.map((c) =>
      c.id === chatId
        ? {
            ...c,
            messages: [
              ...c.messages,
              { role: 'user' as const, content, createdAt: now },
            ],
            updatedAt: now,
          }
        : c,
    ),
  }));
}

async function postTurn(chatId: string, model: string, userText: string) {
  const s = useChatStore.getState();
  const after = s.chats.find((c) => c.id === chatId);
  const assistantReply =
    after?.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? '';
  // Extracción de memoria (v2.6): hechos clave del intercambio, llamada oculta
  void useFactsStore
    .getState()
    .extractAndSave(
      s.ollamaUrl,
      model,
      userText,
      assistantReply,
      after?.projectId ?? 'general',
      chatId,
    );
  // Título inteligente (v2.6): el modelo nombra la conversación por su tema
  const genericTitle =
    !after || after.title === 'Chat nuevo' || after.title.slice(0, 40) === userText.slice(0, 40);
  if (genericTitle && assistantReply.length > 40) {
    void generateTitle(s.ollamaUrl, model, userText, assistantReply).then((title) => {
      if (!title) return;
      useChatStore.setState((st) => ({
        chats: st.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
      }));
      void useChatStore.getState().scheduleSave();
    });
  }
}

/** Autoriza (o rechaza) el comando pendiente y reanuda el bucle del agente. */
async function confirmAction(allow: boolean): Promise<void> {
  const s = useChatStore.getState();
  const call = s.pendingCommand;
  const chatId = s.activeChatId;
  const chat = s.chats.find((c) => c.id === chatId);
  if (!call || !chat || !chatId) {
    useChatStore.setState({ pendingCommand: null, queuedCommands: [] });
    return;
  }
  const outcome = allow
    ? await executeTool(call)
    : { call, ok: false, output: 'El usuario rechazó el comando.' };
  const generationId = s.generationId ?? uid();
  const model = chat.model;
  useChatStore.setState({
    toolLog: [
      { label: describeCall(call), ok: outcome.ok, output: outcome.output, ts: Date.now() },
      ...s.toolLog,
    ].slice(0, 100),
    pendingCommand: null,
    queuedCommands: [],
    generationId,
  });
  appendToolResults(chatId, [{ label: describeCall(call), ok: outcome.ok, output: outcome.output }]);
  await runAgentTurn(chatId, model, generationId);
}
