import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CircleAlert, Sparkles, Square } from 'lucide-react';
import type { ChatMessage } from '../store/chat';
import { ThinkingPanel } from './ThinkingPanel';
import { CodeBlock } from './CodeBlock';

/** Burbuja de mensaje: user en muted, assistant con avatar y markdown. */
export const MessageBubble = memo(function MessageBubble({
  message,
  isGenerating,
}: {
  message: ChatMessage;
  isGenerating: boolean;
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
        )}
        {message.error && (
          <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-error">
            <CircleAlert size={15} aria-hidden />
            {message.error}
          </p>
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
