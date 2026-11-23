/** Agregación del registro de uso de tokens (v2.1). Funciones puras, testeadas. */
export interface UsageEvent {
  ts: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ModelUsage {
  model: string;
  tokens: number;
  turns: number;
}

export interface DayUsage {
  label: string;
  tokens: number;
}

export interface UsageSummary {
  sessionTokens: number;
  weekTokens: number;
  sessionPct: number;
  weekPct: number;
  sessionRemaining: number;
  weekRemaining: number;
  topModel: ModelUsage | null;
  byModel: ModelUsage[];
  byDay: DayUsage[];
}

export const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export const DEFAULT_SESSION_BUDGET = 500_000;
export const DEFAULT_WEEK_BUDGET = 2_000_000;

export function tokensOf(e: UsageEvent): number {
  return (e.promptTokens || 0) + (e.completionTokens || 0);
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Resumen de uso: sesión (desde sessionStart), semana móvil (7 días), por modelo y por día. */
export function summarizeUsage(
  events: UsageEvent[],
  opts: {
    now: number;
    sessionStart: number;
    sessionBudget: number;
    weekBudget: number;
  },
): UsageSummary {
  const { now, sessionStart, sessionBudget, weekBudget } = opts;
  let sessionTokens = 0;
  let weekTokens = 0;
  const models = new Map<string, ModelUsage>();
  const days = new Map<string, { label: string; tokens: number; dayStart: number }>();

  for (const e of events) {
    const tokens = tokensOf(e);
    if (e.ts >= sessionStart) sessionTokens += tokens;
    if (e.ts >= now - WEEK_MS) {
      weekTokens += tokens;
      const m = models.get(e.model) ?? { model: e.model, tokens: 0, turns: 0 };
      m.tokens += tokens;
      m.turns += 1;
      models.set(e.model, m);
      const d = new Date(e.ts);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const key = String(dayStart);
      const day = days.get(key) ?? {
        label: `${WEEKDAYS[d.getDay()]} ${d.getDate()}`,
        tokens: 0,
        dayStart,
      };
      day.tokens += tokens;
      days.set(key, day);
    }
  }

  const pct = (used: number, budget: number) =>
    budget > 0 ? Math.min(100, (used / budget) * 100) : 0;

  const byModel = [...models.values()].sort((a, b) => b.tokens - a.tokens);
  const byDay = [...days.values()]
    .sort((a, b) => a.dayStart - b.dayStart)
    .map(({ label, tokens }) => ({ label, tokens }));

  return {
    sessionTokens,
    weekTokens,
    sessionPct: pct(sessionTokens, sessionBudget),
    weekPct: pct(weekTokens, weekBudget),
    sessionRemaining: Math.max(0, sessionBudget - sessionTokens),
    weekRemaining: Math.max(0, weekBudget - weekTokens),
    topModel: byModel[0] ?? null,
    byModel,
    byDay,
  };
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1000) return `${trimZero((n / 1000).toFixed(1))}k`;
  return String(n);
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Eventos tolerantes desde JSON crudo (descarta entradas inválidas). */
export function hydrateUsage(raw: string | null): UsageEvent[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is UsageEvent =>
        !!e && typeof e === 'object' &&
        typeof (e as UsageEvent).ts === 'number' &&
        typeof (e as UsageEvent).model === 'string' &&
        typeof (e as UsageEvent).promptTokens === 'number' &&
        typeof (e as UsageEvent).completionTokens === 'number',
    );
  } catch {
    return [];
  }
}

export function serializeUsage(events: UsageEvent[]): string {
  return JSON.stringify(events);
}
