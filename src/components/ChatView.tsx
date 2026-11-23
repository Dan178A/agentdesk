import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../store/chat';
import { parseModels, DEFAULT_ALIASES, type ModelRaw, type ModelUI } from '../lib/models';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { ErrorBanner } from './ErrorBanner';
import { ContextMeter } from './ContextMeter';
import { UsageRing } from './UsageRing';
import { useUsageStore } from '../store/usage';
import { useMemoryStore } from '../store/memory';
import { summarizeUsage } from '../lib/usage';
import { useAgentsStore } from '../store/agents';
import { AgentLogo } from '../assets/AgentLogo';
import { FileCode2, FlaskConical, Globe, FileText } from 'lucide-react';

/** Resumen de uso dentro del estado inicial («dashboard al iniciar», v2.1). */
function EmptyStateUsageSummary() {
  const events = useUsageStore((s) => s.events);
  const sessionStart = useUsageStore((s) => s.sessionStart);
  const sessionBudget = useUsageStore((s) => s.sessionBudget);
  const weekBudget = useUsageStore((s) => s.weekBudget);
  const setView = useAgentsStore((s) => s.setView);

  const s = summarizeUsage(events, {
    now: Date.now(),
    sessionStart,
    sessionBudget,
    weekBudget,
  });

  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-fg">
      {s.weekTokens > 0 ? (
        <>
          Últimos 7 días: <strong className="text-fg">{s.weekTokens.toLocaleString('es')}</strong>{' '}
          tokens ({Math.round(s.weekPct)}% del presupuesto)
          {s.topModel && (
            <>
              {' '}· el más usado: <strong className="text-fg">{s.topModel.model}</strong>
            </>
          )}
        </>
      ) : (
        <>El uso de tokens por modelo y por día aparece aquí al empezar a chatear.</>
      )}
      <button
        type="button"
        onClick={() => setView('usage')}
        className="text-primary underline-offset-2 hover:underline"
      >
        ver dashboard
      </button>
    </p>
  );
}

const SUGERENCIAS = [
  { Icon: FileCode2, label: 'Explícame este código', text: 'Explícame este código:\n\n' },
  { Icon: FlaskConical, label: 'Escríbeme tests', text: 'Escríbeme tests para:\n\n' },
  { Icon: Globe, label: 'Hazme una página web', text: 'Hazme una página web de ' },
  { Icon: FileText, label: 'Resume un texto largo', text: 'Resume este texto:\n\n' },
] as const;

/** Barra superior con los anillos de uso (sesión + semana, v2.1). */
function UsageBar() {
  const events = useUsageStore((s) => s.events);
  const sessionStart = useUsageStore((s) => s.sessionStart);
  const sessionBudget = useUsageStore((s) => s.sessionBudget);
  const weekBudget = useUsageStore((s) => s.weekBudget);
  const load = useUsageStore((s) => s.load);
  const setView = useAgentsStore((s) => s.setView);

  useEffect(() => {
    void load();
  }, [load]);

  const s = summarizeUsage(events, {
    now: Date.now(),
    sessionStart,
    sessionBudget,
    weekBudget,
  });

  return (
    <div className="flex items-center justify-end gap-4 border-b border-border bg-surface px-4 py-1.5">
      <button
        type="button"
        onClick={() => setView('usage')}
        className="flex items-center gap-4 transition-opacity hover:opacity-80"
        aria-label="Abrir dashboard de uso de tokens"
      >
        <UsageRing
          pct={s.sessionPct}
          label="Sesión"
          title={`Sesión: ${s.sessionTokens} de ${sessionBudget} tokens — quedan ${s.sessionRemaining}. Click para el dashboard.`}
        />
        <UsageRing
          pct={s.weekPct}
          label="Semana"
          title={`7 días: ${s.weekTokens} de ${weekBudget} tokens — quedan ${s.weekRemaining}. Click para el dashboard.`}
        />
      </button>
    </div>
  );
}

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
    void useMemoryStore.getState().init(); // memoria integrada (v2.4)
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
      <UsageBar />
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
                <EmptyStateUsageSummary />
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
