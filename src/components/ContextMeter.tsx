import { memo } from 'react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Medidor de contexto estilo Claude Code (RF-16): usado/total, ámbar 80%, rojo 95%. */
export const ContextMeter = memo(function ContextMeter({
  used,
  limit,
}: {
  used?: number;
  limit?: number;
}) {
  const total = limit && limit > 0 ? limit : 1_000_000; // fallback: modelos cloud 1M
  const usedSafe = used ?? 0;
  const pct = Math.min(100, (usedSafe / total) * 100);

  if (usedSafe === 0) return null;

  const level = pct >= 95 ? 'error' : pct >= 80 ? 'amber' : 'ok';

  return (
    <div
      className="flex items-center gap-2 border-b border-border bg-surface px-4 py-1.5 text-xs"
      role="status"
      aria-label={`Contexto: ${formatTokens(usedSafe)} de ${formatTokens(total)} tokens`}
    >
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            level === 'error'
              ? 'bg-error'
              : level === 'amber'
                ? 'bg-amber-500'
                : 'bg-primary'
          }`}
          style={{ width: `${Math.max(pct, 1.5)}%` }}
        />
      </div>
      <span className={level === 'ok' ? 'text-muted-fg' : 'font-medium text-fg'}>
        {formatTokens(usedSafe)} / {formatTokens(total)} tokens ({pct.toFixed(pct < 1 ? 1 : 0)}%)
      </span>
      {level === 'error' && (
        <span className="font-medium text-error">
          Cerca del límite — usa /clear o un chat nuevo
        </span>
      )}
      {level === 'amber' && <span className="text-amber-600 dark:text-amber-400">Acercándote al límite</span>}
    </div>
  );
});
