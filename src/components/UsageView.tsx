import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Activity, ArrowLeft, Cloud, KeyRound, RefreshCw, TriangleAlert, TrendingUp, Zap } from 'lucide-react';
import { useUsageStore } from '../store/usage';
import { useAgentsStore } from '../store/agents';
import { summarizeUsage, formatTokens } from '../lib/usage';
import { parseCloudUsage, type CloudUsage } from '../lib/cloudUsage';
import { UsageRing } from './UsageRing';

/** Dashboard de uso de tokens (v2.1): sesión, semana, modelos y días. */
export function UsageView() {
  const events = useUsageStore((s) => s.events);
  const sessionStart = useUsageStore((s) => s.sessionStart);
  const sessionBudget = useUsageStore((s) => s.sessionBudget);
  const weekBudget = useUsageStore((s) => s.weekBudget);
  const setView = useAgentsStore((s) => s.setView);

  useEffect(() => {
    void useUsageStore.getState().load();
  }, []);

  const summary = useMemo(
    () => summarizeUsage(events, { now: Date.now(), sessionStart, sessionBudget, weekBudget }),
    [events, sessionStart, sessionBudget, weekBudget],
  );

  const maxDay = Math.max(1, ...summary.byDay.map((d) => d.tokens));

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <button
          type="button"
          onClick={() => setView('chats')}
          aria-label="Volver a los chats"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
        >
          <ArrowLeft size={15} aria-hidden />
          Chats
        </button>
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <Activity size={16} className="text-primary" aria-hidden />
          Uso de tokens
        </h1>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* Anillos: sesión y semana */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <BudgetCard
            title="Esta sesión"
            used={summary.sessionTokens}
            remaining={summary.sessionRemaining}
            pct={summary.sessionPct}
            budget={sessionBudget}
          />
          <BudgetCard
            title="Últimos 7 días"
            used={summary.weekTokens}
            remaining={summary.weekRemaining}
            pct={summary.weekPct}
            budget={weekBudget}
            note="Semana móvil; presupuestos editables en usage.json (sessionBudget/weekBudget)"
          />
        </section>

        {summary.weekTokens === 0 && (
          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-fg">
            Aún no hay uso registrado — envía tu primer mensaje y el medidor empezará a contar.
          </p>
        )}

        {/* Nube: uso real de ollama.com (v2.2) */}
        <CloudUsageSection />

        {/* Modelos */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp size={14} aria-hidden />
            Modelos más usados (7 días)
          </h2>
          {summary.byModel.length === 0 ? (
            <p className="text-sm text-muted-fg">Sin datos todavía.</p>
          ) : (
            <ul className="space-y-2">
              {summary.byModel.map((m, i) => {
                const pctTop = (m.tokens / summary.byModel[0].tokens) * 100;
                return (
                  <li key={m.model} className="rounded-xl border border-border bg-surface px-4 py-3">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        {i === 0 && <Zap size={13} className="shrink-0 text-primary" aria-hidden />}
                        <span className="truncate font-medium">{m.model}</span>
                        {i === 0 && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-fg">
                            el más usado
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-fg">
                        {formatTokens(m.tokens)} tokens · {m.turns} turno{m.turns === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${Math.max(pctTop, 1.5)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Últimos 7 días */}
        {summary.byDay.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Distribución por día</h2>
            <div className="flex h-28 items-end gap-2 rounded-xl border border-border bg-surface px-4 py-3">
              {summary.byDay.map((d) => (
                <div
                  key={d.label}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  title={`${d.label}: ${formatTokens(d.tokens)} tokens`}
                >
                  <div
                    className="w-full max-w-14 rounded-t-md bg-primary/70"
                    style={{ height: `${Math.max((d.tokens / maxDay) * 80, 3)}px` }}
                    aria-hidden
                  />
                  <span className="truncate text-[10px] text-muted-fg">{d.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Sección de uso real contra ollama.com (v2.2): requiere API key (Settings › Keys). */
function CloudUsageSection() {
  const apiKey = useUsageStore((s) => s.ollamaApiKey);
  const setApiKey = useUsageStore((s) => s.setApiKey);
  const [inputKey, setInputKey] = useState(apiKey);
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [cloud, setCloud] = useState<CloudUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = async (r: '24h' | '7d' | '30d') => {
    setLoading(true);
    setError(null);
    try {
      const raw = await invoke<string>('cloud_usage', { apiKey, range: r });
      setCloud(parseCloudUsage(raw));
    } catch (e) {
      setError(String(e));
      setCloud(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiKey) void fetchUsage(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, range]);

  if (!apiKey) {
    return (
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Cloud size={14} aria-hidden />
          Ollama Cloud (uso real)
        </h2>
        <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted-fg">
            Pega tu API key de <span className="font-mono text-fg">ollama.com › Settings › Keys</span> para
            ver el uso que la nube reporta (tokens, requests y dólares por rango).
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputKey.trim()) setApiKey(inputKey);
              }}
              placeholder="ollama_live_…"
              aria-label="API key de ollama.com"
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              onClick={() => inputKey.trim() && setApiKey(inputKey)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-fg transition-opacity hover:opacity-90"
            >
              <KeyRound size={13} aria-hidden />
              Conectar
            </button>
          </div>
        </div>
      </section>
    );
  }

  const maxBucket = cloud ? Math.max(1, ...cloud.buckets.map((b) => b.tokens)) : 1;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <Cloud size={14} aria-hidden />
          Ollama Cloud (uso real)
        </h2>
        <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs">
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-2.5 py-1 transition-colors duration-200 ${
                range === r ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void fetchUsage(range)}
          aria-label="Actualizar el uso de la nube"
          className="rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden />
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-2 flex items-start gap-1.5 text-xs text-error">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          {error.replace('Error: ', '')}
        </p>
      )}

      {cloud && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Tokens entrada" value={formatTokens(cloud.totals.inputTokens)} />
            <Stat label="De caché" value={formatTokens(cloud.totals.cachedInputTokens)} />
            <Stat label="Tokens salida" value={formatTokens(cloud.totals.outputTokens)} />
            <Stat label="Gasto" value={`$${cloud.totals.usd.toFixed(cloud.totals.usd < 1 ? 4 : 2)}`} />
          </div>

          {cloud.buckets.length > 0 && (
            <div className="flex h-24 items-end gap-1.5 rounded-xl border border-border bg-surface px-4 py-3">
              {cloud.buckets.map((b) => (
                <div
                  key={b.fromTs}
                  className="flex min-w-0 flex-1 flex-col items-center"
                  title={`${new Date(b.fromTs).toLocaleString('es')} — ${formatTokens(b.tokens)} tokens · ${b.requests} requests`}
                >
                  <div
                    className={`w-full max-w-10 rounded-t ${b.partial ? 'bg-primary/40' : 'bg-primary/70'}`}
                    style={{ height: `${Math.max((b.tokens / maxBucket) * 60, 2)}px` }}
                    aria-hidden
                  />
                </div>
              ))}
            </div>
          )}

          {cloud.models.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface text-sm">
              {cloud.models.map((m) => (
                <li
                  key={m.model}
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 last:border-b-0"
                >
                  <span className="truncate font-medium">{m.model}</span>
                  <span className="shrink-0 text-xs text-muted-fg">
                    {m.requests} request{m.requests === 1 ? '' : 's'}
                    {m.tokens > 0 && ` · ${formatTokens(m.tokens)} tokens`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-fg">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function BudgetCard({
  title,
  used,
  remaining,
  pct,
  budget,
  note,
}: {
  title: string;
  used: number;
  remaining: number;
  pct: number;
  budget: number;
  note?: string;
}) {
  const warn = pct >= 80;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4">
      <UsageRing
        pct={pct}
        label={`${Math.round(pct)}%`}
        title={`${title}: ${formatTokens(used)} de ${formatTokens(budget)} tokens (${Math.round(pct)}%)`}
        size={56}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatTokens(used)}
          <span className="text-sm font-normal text-muted-fg"> / {formatTokens(budget)} tokens</span>
        </p>
        <p className={`flex items-center gap-1.5 text-xs ${warn ? 'font-medium text-warn' : 'text-muted-fg'}`}>
          {pct >= 95 && <TriangleAlert size={12} aria-hidden />}
          {remaining > 0
            ? `quedan ${formatTokens(remaining)}`
            : 'presupuesto agotado — sube el límite en usage.json'}
        </p>
        {note && <p className="mt-1 text-[10px] text-muted-fg">{note}</p>}
      </div>
    </div>
  );
}
