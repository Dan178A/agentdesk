import { describe, it, expect } from 'vitest';
import { parseCloudUsage } from './cloudUsage';

// Fixture literal de docs.ollama.com/api/cloud-usage (22 buckets vacíos omitidos)
const DOCS_FIXTURE = JSON.stringify({
  range: '24h',
  scope: 'self',
  granularity: 'hour',
  from: '2026-09-30T02:00:00Z',
  until: '2026-10-01T02:30:00Z',
  totals: {
    request_count: 15,
    usage_usd: 0.01718,
    input_tokens: 106000,
    cached_input_tokens: 46000,
    output_tokens: 13600,
  },
  buckets: [
    { from: '2026-09-30T12:00:00Z', until: '2026-09-30T13:00:00Z', request_count: 4, usage_usd: 0.0052, input_tokens: 24000, cached_input_tokens: 0, output_tokens: 3200 },
    { from: '2026-10-01T00:00:00Z', until: '2026-10-01T01:00:00Z', request_count: 8, usage_usd: 0.0088, input_tokens: 64000, cached_input_tokens: 40000, output_tokens: 8000 },
  ],
});

describe('parseCloudUsage', () => {
  it('fixture de la doc oficial → totals, buckets y rango', () => {
    const u = parseCloudUsage(DOCS_FIXTURE);
    expect(u).not.toBeNull();
    expect(u!.range).toBe('24h');
    expect(u!.granularity).toBe('hour');
    expect(u!.totals).toEqual({
      requests: 15,
      usd: 0.01718,
      inputTokens: 106000,
      cachedInputTokens: 46000,
      outputTokens: 13600,
    });
    expect(u!.buckets.length).toBe(2);
    expect(u!.buckets[0].tokens).toBe(27200); // 24000 input + 3200 output
    expect(u!.buckets[0].usd).toBeCloseTo(0.0052);
    expect(u!.buckets[0].fromTs).toBe(Date.parse('2026-09-30T12:00:00Z'));
  });

  it('descarta buckets vacíos', () => {
    const raw = JSON.stringify({
      totals: { request_count: 0, input_tokens: 0, output_tokens: 0, usage_usd: 0 },
      buckets: [
        { from: '2026-10-01T00:00:00Z', input_tokens: 0, output_tokens: 0, request_count: 0 },
        { from: '2026-10-01T01:00:00Z', input_tokens: 10, output_tokens: 5, request_count: 1 },
      ],
    });
    const u = parseCloudUsage(raw)!;
    expect(u.buckets.length).toBe(1);
    expect(u.buckets[0].tokens).toBe(15);
  });

  it('models con group_by=model → ordenado por tokens desc', () => {
    const raw = JSON.stringify({
      range: '7d',
      granularity: 'day',
      totals: { request_count: 601, input_tokens: 1000, output_tokens: 100 },
      buckets: [],
      models: [
        { model: 'glm-5.3', request_count: 476, input_tokens: 10, output_tokens: 10 },
        { model: 'glm-5.3-flash', request_count: 123, input_tokens: 500, output_tokens: 50 },
        { model: 'deepseek-v4.1-flash:1017', request_count: 2, input_tokens: 0, output_tokens: 0 },
      ],
    });
    const u = parseCloudUsage(raw)!;
    expect(u.models[0].model).toBe('glm-5.3-flash'); // 550 tokens
    expect(u.models[0].requests).toBe(123);
    expect(u.models[2].model).toBe('deepseek-v4.1-flash:1017');
  });

  it('tolerate: sin models, sin buckets, JSON corrupto', () => {
    const u = parseCloudUsage(JSON.stringify({ range: '7d', totals: {} }));
    expect(u!.models).toEqual([]);
    expect(u!.buckets).toEqual([]);
    expect(parseCloudUsage('{roto')).toBeNull();
    expect(parseCloudUsage('null')).toBeNull();
  });

  it('partial marcado en el bucket en curso', () => {
    const raw = JSON.stringify({
      totals: { request_count: 3 },
      buckets: [{ from: '2026-10-01T02:00:00Z', input_tokens: 1, output_tokens: 1, request_count: 3, partial: true }],
    });
    expect(parseCloudUsage(raw)!.buckets[0].partial).toBe(true);
  });
});
