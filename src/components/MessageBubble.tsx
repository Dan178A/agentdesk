import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CircleAlert, MonitorPlay, RefreshCw, Sparkles, Square } from 'lucide-react';
import type { ChatMessage } from '../store/chat';
import { ThinkingPanel } from './ThinkingPanel';
import { CodeBlock } from './CodeBlock';
import { extractPreview } from '../lib/preview';
import { usePreviewStore } from '../store/preview';

/** Burbuja de mensaje: user en muted, assistant con avatar y markdown. */
export const MessageBubble = memo(function MessageBubble({
  message,
  isGenerating,
  isLast,
  onRetry,
}: {
  message: ChatMessage;
  isGenerating: boolean;
  isLast?: boolean;
  onRetry?: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3">
          {message.content}
        </div>
      </div>
    );
  }

  const streamingHere = isGenerating && !message.error;
  const empty = !message.content && !message.thinking && !message.error;
  const previewable = !streamingHere ? extractPreview(message.content) : null;

  return (
    <div className="flex gap-3">
      <div className="mt-1 shrink-0">
        <Sparkles size={18} className="text-primary" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <ThinkingPanel
          thinking={message.thinking}
          thinkingMs={message.thinkingMs}
          isGenerating={streamingHere && !!message.thinking}
        />
        {empty && streamingHere ? (
          <TypingDots />
        ) : (
          <>
            <div className="markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: (props) => <CodeBlock {...props} />,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
            {previewable && (
              <button
                type="button"
                onClick={() => usePreviewStore.getState().show(previewable)}
                className="mt-2 flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-fg transition-colors duration-200 hover:border-ring hover:text-fg"
              >
                <MonitorPlay size={13} aria-hidden />
                Abrir en el panel de vista previa
              </button>
            )}
          </>
        )}
        {message.error && (
          <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-error">
            <CircleAlert size={15} aria-hidden />
            {message.error}
            {isLast && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1 rounded-lg border border-error/40 px-2 py-0.5 text-xs font-medium transition-colors duration-200 hover:bg-error/10"
              >
                <RefreshCw size={12} aria-hidden />
                Reintentar
              </button>
            )}
          </div>
        )}
        {message.stopped && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-fg">
            <Square size={9} aria-hidden />
            detenido por el usuario
          </p>
        )}
      </div>
    </div>
  );
});

function TypingDots() {
  return (
    <div className="flex gap-1 py-2" aria-label="Generando respuesta">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot size-2 rounded-full bg-muted-fg"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
