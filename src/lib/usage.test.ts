import { describe, it, expect } from 'vitest';
import {
  summarizeUsage,
  hydrateUsage,
  serializeUsage,
  formatTokens,
  DAY_MS,
  DEFAULT_SESSION_BUDGET,
  DEFAULT_WEEK_BUDGET,
  type UsageEvent,
} from './usage';

const NOW = 1_700_000_000_000; // instante fijo para tests

function ev(model: string, tokens: number, agoMs: number): UsageEvent {
  return { ts: NOW - agoMs, model, promptTokens: Math.floor(tokens / 2), completionTokens: tokens - Math.floor(tokens / 2) };
}

const BUDGETS = { sessionBudget: DEFAULT_SESSION_BUDGET, weekBudget: DEFAULT_WEEK_BUDGET };

describe('summarizeUsage', () => {
  it('sesión = eventos desde sessionStart; semana = ventana móvil de 7 días', () => {
    const events = [
      ev('glm', 1000, 1 * DAY_MS),        // en sesión y semana
      ev('deepseek', 2000, 3 * DAY_MS),   // en semana, antes de sessionStart
      ev('glm', 500, 8 * DAY_MS),         // fuera de la semana
    ];
    const s = summarizeUsage(events, { now: NOW, sessionStart: NOW - 2 * DAY_MS, ...BUDGETS });
    expect(s.sessionTokens).toBe(1000);
    expect(s.weekTokens).toBe(3000);
    expect(s.weekPct).toBeCloseTo((3000 / DEFAULT_WEEK_BUDGET) * 100);
  });

  it('byModel ordenado desc y topModel es el que más usó', () => {
    const events = [
      ev('glm', 100, 1 * DAY_MS),
      ev('deepseek', 300, 1 * DAY_MS),
      ev('glm', 400, 2 * DAY_MS),
    ];
    const s = summarizeUsage(events, { now: NOW, sessionStart: NOW - 2 * DAY_MS, ...BUDGETS });
    expect(s.topModel?.model).toBe('glm');
    expect(s.topModel?.tokens).toBe(500);
    expect(s.topModel?.turns).toBe(2);
    expect(s.byModel.map((m) => m.model)).toEqual(['glm', 'deepseek']);
  });

  it('presupuesto 0 → pct 0 pero tokens contados', () => {
    const s = summarizeUsage([ev('glm', 100, 0)], {
      now: NOW, sessionStart: NOW - 1000, sessionBudget: 0, weekBudget: 0,
    });
    expect(s.sessionTokens).toBe(100);
    expect(s.sessionPct).toBe(0);
  });

  it('pct se trunca al 100% y el restante nunca es negativo', () => {
    const s = summarizeUsage([ev('glm', 10_000_000, 0)], {
      now: NOW, sessionStart: NOW - 1000, sessionBudget: 1000, weekBudget: 1000,
    });
    expect(s.sessionPct).toBe(100);
    expect(s.sessionRemaining).toBe(0);
    expect(s.weekPct).toBe(100);
  });

  it('byDay cronológico (viejo → nuevo) con etiqueta en español', () => {
    const events = [ev('glm', 100, 0), ev('glm', 200, DAY_MS)];
    const s = summarizeUsage(events, { now: NOW, sessionStart: NOW - 7 * DAY_MS, ...BUDGETS });
    expect(s.byDay.length).toBe(2);
    expect(s.byDay[0].tokens).toBe(200); // ayer
    expect(s.byDay[1].tokens).toBe(100); // hoy
    expect(s.byDay[1].label).toMatch(/^(dom|lun|mar|mié|jue|vie|sáb) \d+$/);
  });

  it('sin eventos → todo en cero y topModel null', () => {
    const s = summarizeUsage([], { now: NOW, sessionStart: NOW - 1000, ...BUDGETS });
    expect(s.weekTokens).toBe(0);
    expect(s.topModel).toBeNull();
    expect(s.byModel).toEqual([]);
    expect(s.byDay).toEqual([]);
  });
});

describe('hydrateUsage / serializeUsage', () => {
  it('JSON válido → eventos; corrupto → []; null → []', () => {
    const events = [{ ts: 1, model: 'glm', promptTokens: 10, completionTokens: 20 }];
    expect(hydrateUsage(JSON.stringify(events))).toEqual(events);
    expect(hydrateUsage('{corrupto')).toEqual([]);
    expect(hydrateUsage(null)).toEqual([]);
    expect(hydrateUsage(JSON.stringify([{ ts: 'x', model: 'm' }]))).toEqual([]);
  });
  it('roundtrip serialize → hydrate', () => {
    const events = [{ ts: 5, model: 'deepseek', promptTokens: 1, completionTokens: 2 }];
    expect(hydrateUsage(serializeUsage(events))).toEqual(events);
  });
});

describe('formatTokens', () => {
  it('abrevia miles y millones sin ceros flojos', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(12_400)).toBe('12.4k');
    expect(formatTokens(500_000)).toBe('500k');
    expect(formatTokens(2_000_000)).toBe('2M');
    expect(formatTokens(1_230_000)).toBe('1.2M');
  });
});
