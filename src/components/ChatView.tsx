import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../store/chat';
import { parseModels, DEFAULT_ALIASES, type ModelRaw, type ModelUI } from '../lib/models';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { ErrorBanner } from './ErrorBanner';
import { ContextMeter } from './ContextMeter';

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
            <div className="flex flex-col items-center gap-3 pt-24 text-center">
              <h1 className="text-2xl font-semibold">AgentDesk</h1>
              <p className="max-w-md text-muted-fg">
                Chat con tus modelos de Ollama. Escribe <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">/</code> para
                cargar skills, elige modelo abajo y pregunta lo que quieras.
              </p>
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
      <ChatInput models={models} activeModel={activeModel} onSelect={setActiveModel} />
    </div>
  );
}
