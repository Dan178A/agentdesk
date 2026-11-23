/** Parser del JSON de ollama.com/api/usage (v2.2). Tolerante a claves ausentes. */
export interface CloudTotals {
  requests: number;
  usd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface CloudBucket {
  fromTs: number;
  toTs: number;
  tokens: number;
  usd: number;
  requests: number;
  partial?: boolean;
}

export interface CloudModel {
  model: string;
  requests: number;
  tokens: number;
}

export interface CloudUsage {
  range: string;
  granularity: string;
  totals: CloudTotals;
  buckets: CloudBucket[];
  models: CloudModel[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const ts = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) || 0 : num(v));

/** Parsea la respuesta de /api/usage; null si es ilegible. */
export function parseCloudUsage(raw: string): CloudUsage | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const t = (obj.totals ?? {}) as Record<string, unknown>;
  const totals: CloudTotals = {
    requests: num(t.request_count),
    usd: num(t.usage_usd),
    inputTokens: num(t.input_tokens),
    cachedInputTokens: num(t.cached_input_tokens),
    outputTokens: num(t.output_tokens),
  };
  const buckets: CloudBucket[] = Array.isArray(obj.buckets)
    ? (obj.buckets as Record<string, unknown>[])
        .map((b) => {
          const fromTs = ts(b.from);
          const input = num(b.input_tokens);
          const output = num(b.output_tokens);
          return {
            fromTs,
            toTs: ts(b.until),
            tokens: input + output,
            usd: num(b.usage_usd),
            requests: num(b.request_count),
            partial: b.partial === true,
          };
        })
        .filter((b) => b.tokens > 0 || b.requests > 0)
    : [];
  const rawModels = Array.isArray(obj.models) ? (obj.models as Record<string, unknown>[]) : [];
  const models: CloudModel[] = rawModels
    .map((m) => {
      const name = (m.model ?? m.model_name ?? m.name) as unknown;
      const input = num(m.input_tokens);
      const output = num(m.output_tokens);
      const nestedTotals = (m.totals ?? {}) as Record<string, unknown>;
      return {
        model: typeof name === 'string' ? name : 'desconocido',
        requests: num(m.request_count) || num(nestedTotals.request_count),
        tokens: input + output + num(nestedTotals.input_tokens) + num(nestedTotals.output_tokens),
      };
    })
    .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests);
  return {
    range: typeof obj.range === 'string' ? obj.range : '7d',
    granularity: typeof obj.granularity === 'string' ? obj.granularity : 'hour',
    totals,
    buckets,
    models,
  };
}
