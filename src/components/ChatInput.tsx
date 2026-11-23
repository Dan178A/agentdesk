import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Brain, History, MessageSquare, MousePointerClick, Paperclip, Send, Square, X, Loader2, CircleAlert } from 'lucide-react';
import { useChatStore } from '../store/chat';
import { usePreviewStore } from '../store/preview';
import { useMemoryStore } from '../store/memory';
import { fileToAttachment, fileToPreview, readFile } from '../lib/fsFiles';
import type { ModelUI } from '../lib/models';
import { ModelPicker } from './ModelPicker';
import { SlashMenu, executeSelection } from './SlashMenu';
import type { MenuItem } from '../lib/skills';

interface Props {
  models: ModelUI[];
  activeModel: string;
  onSelect: (id: string) => void;
  /** Texto que llega desde fuera (chips del empty state); se vuelca al input. */
  prefill?: string;
  /** Cambia el nonce para re-disparar el prefijo aunque el texto se repita. */
  prefillKey?: number;
}

/** Input de chat: textarea autoexpandible, selector de modelo, enviar/stop. */
export function ChatInput({ models, activeModel, onSelect, prefill, prefillKey }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const stopActive = useChatStore((s) => s.stopActive);
  const skillDir = useChatStore((s) => s.skillDir);
  const clearSkill = useChatStore((s) => s.clearSkill);
  const [modelPickerRequest, setModelPickerRequest] = useState(0);
  const memoryActive = useMemoryStore((s) => s.active);
  const memoryFileCount = useMemoryStore((s) => s.files.length);
  const memoryError = useMemoryStore((s) => s.error);
  const memoryLoading = useMemoryStore((s) => s.loading);
  const toggleMemory = () => useMemoryStore.getState().toggle();
  const pendingFolders = useChatStore((s) => s.pendingFolders);
  const removeFolder = useChatStore((s) => s.removeFolder);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const addFiles = async () => {
    setAttachError(null);
    setAttaching(true);
    setAttachMenuOpen(false);
    try {
      const selected = await open({
        multiple: true,
        title: 'Adjuntar archivos',
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        try {
          const f = await readFile(path);
          const preview = fileToPreview(f);
          if (preview) {
            usePreviewStore.getState().show(preview);
            setText(
              (prev) =>
                `${prev}\n\n(imagen adjuntada: ${f.name} — visible en el panel de vista previa)`,
            );
          } else {
            setText((prev) => prev + fileToAttachment(f));
          }
        } catch (e) {
          setAttachError(String(e));
        }
      }
      autoResizeSoon();
    } finally {
      setAttaching(false);
    }
  };

  const addFolder = async () => {
    setAttachError(null);
    setAttachMenuOpen(false);
    try {
      const selected = await open({
        directory: true,
        title: 'Adjuntar carpeta',
      });
      if (!selected) return;
      // v2.5: la carpeta NO se vuelca al input; queda como chip de contexto
      // y el sistema busca en ella al enviar la consulta.
      await useChatStore.getState().addFolder(selected);
    } catch (e) {
      setAttachError(String(e));
    }
  };

  const autoResizeSoon = () => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        el.focus();
      }
    });
  };

  useEffect(() => {
    if (prefill) {
      setText(prefill);
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
        el.focus();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, prefillKey]);

  const slashOpen = text.startsWith('/');
  const slashQuery = text.slice(1);

  const onSlashSelect = async (item: MenuItem) => {
    await executeSelection(item);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (item.builtin && item.name === 'model') setModelPickerRequest((n) => n + 1);
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const submit = () => {
    const value = text.trim();
    if (!value || isGenerating) return;
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void sendMessage(value, activeModel);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border bg-bg px-6 py-4">
      <div className="mx-auto max-w-3xl">
        {slashOpen && (
          <SlashMenu
            query={slashQuery}
            onSelect={(item) => void onSlashSelect(item)}
            onClose={() => setText('')}
          />
        )}
        {(pendingFolders.length > 0 || skillDir || memoryActive) && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
            {pendingFolders.map((f) => (
              <span
                key={f.path}
                className="flex max-w-64 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-fg"
                title={`${f.path} — el sistema buscará en esta carpeta al enviar`}
              >
                <FolderOpen size={12} aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{f.name}</span>
                  <span className="ml-1">{f.files.length > 0 ? `· ${f.files.length} archivos` : '· …'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFolder(f.path)}
                  aria-label={`Quitar la carpeta ${f.name}`}
                  className="ml-1 rounded-full p-0.5 transition-colors duration-200 hover:bg-surface hover:text-fg"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
            {memoryActive && (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-fg">
                <Brain size={12} aria-hidden />
                Memoria: <span className="font-medium text-fg">{memoryFileCount} fichas</span>
                {memoryLoading && <Loader2 size={11} className="animate-spin" aria-hidden />}
                {memoryError && <CircleAlert size={12} className="text-error" aria-hidden />}
                <button
                  type="button"
                  onClick={() => void toggleMemory()}
                  aria-label="Desactivar la memoria de proyectos"
                  className="ml-1 rounded-full p-0.5 transition-colors duration-200 hover:bg-surface hover:text-fg"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            )}
            {skillDir && (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-fg">
                Skill activo: <span className="font-medium text-fg">{skillDir}</span>
                <button
                  type="button"
                  onClick={clearSkill}
                  aria-label="Quitar skill activo"
                  className="ml-1 rounded-full p-0.5 transition-colors duration-200 hover:bg-surface hover:text-fg"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            )}
          </div>
        )}
        <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 transition-colors duration-200 focus-within:border-ring">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAttachMenuOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAttachMenuOpen(false);
              }}
              disabled={attaching}
              aria-label="Adjuntar: archivos o carpeta"
              aria-expanded={attachMenuOpen}
              aria-haspopup="menu"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-fg transition-colors duration-200 hover:bg-muted disabled:opacity-40"
            >
              <Paperclip size={15} aria-hidden />
            </button>
            {attachMenuOpen && (
              <div
                role="menu"
                aria-label="Opciones de adjuntar"
                className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void addFiles()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted"
                >
                  <MousePointerClick size={15} aria-hidden />
                  <span>
                    Archivos…
                    <span className="block text-xs text-muted-fg">uno o varios (texto o imagen)</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void addFolder()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted"
                >
                  <FolderOpen size={15} aria-hidden />
                  <span>
                    Carpeta…
                    <span className="block text-xs text-muted-fg">
                      queda como chip: el sistema busca en ella al enviar
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoResize();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Escribe tu mensaje… (Shift+Enter para nueva línea)"
            aria-label="Mensaje para el modelo"
            className="max-h-50 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-fg"
          />
          <ModelPicker
            models={models}
            selected={activeModel}
            onSelect={onSelect}
            openRequest={modelPickerRequest}
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={stopActive}
              aria-label="Detener generación"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-fg transition-colors duration-200 hover:bg-muted"
            >
              <Square size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Enviar mensaje"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg transition-colors duration-200 hover:opacity-90 disabled:opacity-40"
            >
              <Send size={15} aria-hidden />
            </button>
          )}
        </div>
        {attachError && (
          <p role="alert" className="mt-1 text-xs text-error">
            {attachError}
          </p>
        )}
        <RecentChatsRow />
        <p className="mt-2 text-center text-xs text-muted-fg">
          Los modelos corren en tu Ollama local. El razonamiento del modelo se muestra antes de la
          respuesta.
        </p>
      </div>
    </div>
  );
}

/** Últimos chats del proyecto activo bajo el input (v2.6). */
function RecentChatsRow() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const active = chats.find((c) => c.id === activeChatId);
  if (!active) return null;
  const recent = chats
    .filter((c) => c.projectId === active.projectId && c.id !== activeChatId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  if (recent.length === 0) return null;

  const activate = (id: string) => useChatStore.getState().setActive(id);
  return (
    <div className="mt-2" aria-label="Últimos chats de este proyecto">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-muted-fg">
          <History size={11} aria-hidden />
          Últimos del proyecto:
        </span>
        {recent.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => activate(c.id)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-muted-fg transition-colors duration-200 hover:border-ring hover:text-fg"
          >
            <span className="max-w-40 truncate">{c.title || 'Chat nuevo'}</span>
            {c.messages.some((m) => m.role === 'assistant') && (
              <MessageSquare size={10} aria-hidden className="text-muted-fg" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
