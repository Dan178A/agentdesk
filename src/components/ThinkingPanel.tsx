import { memo, useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';

interface Props {
  thinking?: string;
  thinkingMs?: number;
  isGenerating: boolean;
}

/** Panel de razonamiento del modelo: colapsable, shimmer mientras genera (spec §8). */
export const ThinkingPanel = memo(function ThinkingPanel({ thinking, thinkingMs, isGenerating }: Props) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? isGenerating;

  if (!thinking && !isGenerating) return null;

  const seconds = ((thinkingMs ?? 0) / 1000).toFixed(1);

  return (
    <div className="mb-3 overflow-hidden rounded-r-lg border-l-2 border-primary bg-muted/60">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-fg transition-colors duration-200 hover:text-fg"
      >
        <Brain size={14} aria-hidden />
        <span>{isGenerating ? 'Pensando…' : `Pensamiento del modelo · ${seconds}s`}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`ml-auto transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div className="thinking-body" data-collapsed={!open}>
        <div>
          <pre
            className={`whitespace-pre-wrap px-3 pb-3 font-mono text-sm text-muted-fg ${
              isGenerating ? 'shimmer' : ''
            }`}
          >
            {thinking}
          </pre>
        </div>
      </div>
    </div>
  );
});
