import { RefreshCw, WifiOff } from 'lucide-react';

interface Props {
  message: string;
  onRetry: () => void;
}

/** Banner de error global (Ollama caído, spec §9). */
export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-sm text-error"
    >
      <span className="flex items-center gap-2">
        <WifiOff size={16} aria-hidden />
        {message}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1.5 rounded px-2 py-1 transition-colors duration-200 hover:bg-error/15"
      >
        <RefreshCw size={13} aria-hidden />
        Reintentar
      </button>
    </div>
  );
}
