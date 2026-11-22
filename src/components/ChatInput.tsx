import { useRef, useState, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../store/chat';
import type { ModelUI } from '../lib/models';
import { ModelPicker } from './ModelPicker';

interface Props {
  models: ModelUI[];
  activeModel: string;
  onSelect: (id: string) => void;
}

/** Input de chat: textarea autoexpandible, selector de modelo, enviar/stop. */
export function ChatInput({ models, activeModel, onSelect }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const stopActive = useChatStore((s) => s.stopActive);

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
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 transition-colors duration-200 focus-within:border-ring">
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
          <ModelPicker models={models} selected={activeModel} onSelect={onSelect} />
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
        <p className="mt-2 text-center text-xs text-muted-fg">
          Los modelos corren en tu Ollama local. El razonamiento del modelo se muestra antes de la
          respuesta.
        </p>
      </div>
    </div>
  );
}
