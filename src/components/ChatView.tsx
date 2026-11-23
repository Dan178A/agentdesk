import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../store/chat';
import { parseModels, DEFAULT_ALIASES, type ModelRaw, type ModelUI } from '../lib/models';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { ErrorBanner } from './ErrorBanner';
import { ContextMeter } from './ContextMeter';
import { AgentLogo } from '../assets/AgentLogo';
import { FileCode2, FlaskConical, Globe, FileText } from 'lucide-react';

const SUGERENCIAS = [
  { Icon: FileCode2, label: 'Explícame este código', text: 'Explícame este código:\n\n' },
  { Icon: FlaskConical, label: 'Escríbeme tests', text: 'Escríbeme tests para:\n\n' },
  { Icon: Globe, label: 'Hazme una página web', text: 'Hazme una página web de ' },
  { Icon: FileText, label: 'Resume un texto largo', text: 'Resume este texto:\n\n' },
] as const;

/** Vista central del chat: mensajes + input con modelos. */
export function ChatView() {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const init = useChatStore((s) => s.init);
  const setModels = useChatStore((s) => s.setModels);
  const ollamaUrl = useChatStore((s) => s.ollamaUrl);

  const [models, setModelsUi] = useState<ModelUI[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState('glm-5.3-flash:cloud');
  const [seed, setSeed] = useState<{ text: string; nonce: number } | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryLast = useChatStore((s) => s.retryLast);

  const loadModels = async () => {
    setModelsError(null);
    try {
      const raw = await invoke<ModelRaw[]>('list_models', { ollamaUrl });
      const parsed = parseModels(raw, DEFAULT_ALIASES);
      setModelsUi(parsed);
      setModels(parsed);
    } catch (e) {
      setModelsError(
        `Ollama no responde en ${ollamaUrl} — arráncalo con «ollama serve»`,
      );
    }
  };

  useEffect(() => {
    init();
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chat = chats.find((c) => c.id === activeChatId);

  // Auto-scroll al fondo cuando llegan chunks
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat?.messages, isGenerating]);

  if (!chat) return <div className="flex-1" />;

  const activeModelInfo = models.find((m) => m.id === activeModel);

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-bg text-fg">
      <ContextMeter used={chat.tokensUsed} limit={activeModelInfo?.contextLength} />
      {modelsError && <ErrorBanner message={modelsError} onRetry={() => void loadModels()} />}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          {chat.messages.length === 0 && (
            <div className="flex flex-col items-center gap-5 pt-16 text-center">
              <AgentLogo size={84} className="opacity-90" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">¿Qué construimos hoy?</h1>
                <p className="mt-2 max-w-md text-muted-fg">
                  Chatea con tus agentes: escribe{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">/</code> para
                  cargar una skill, o elige modelo abajo y pregunta lo que quieras.
                </p>
              </div>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {SUGERENCIAS.map(({ Icon, label, text }) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => setSeed((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }))}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-muted-fg transition-colors duration-200 hover:border-ring hover:text-fg"
                  >
                    <Icon size={14} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((m, i) => (
            <MessageBubble
              key={m.createdAt + i}
              message={m}
              isGenerating={isGenerating && i === chat.messages.length - 1}
              isLast={i === chat.messages.length - 1}
              onRetry={() => void retryLast()}
            />
          ))}
        </div>
      </div>
      <ChatInput
        models={models}
        activeModel={activeModel}
        onSelect={setActiveModel}
        prefill={seed?.text}
        prefillKey={seed?.nonce}
      />
    </div>
  );
}
