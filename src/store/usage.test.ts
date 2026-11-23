import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUsageStore } from './usage';
import { onInvoke, resetIpc, ipcCalls } from '../test/mock-ipc';
import type { UsageEvent } from '../lib/usage';

beforeEach(() => {
  resetIpc();
  useUsageStore.setState({ events: [], sessionBudget: 500_000, weekBudget: 2_000_000 });
});

describe('store de uso', () => {
  it('record acumula eventos y persiste con debounce', async () => {
    const calls0 = ipcCalls().filter((c) => c.cmd === 'usage_save').length;
    useUsageStore.getState().record('glm', 120, 8);
    useUsageStore.getState().record('deepseek', 10, 5);
    const s = useUsageStore.getState();
    expect(s.events.length).toBe(2);
    expect(s.events[0].model).toBe('glm');
    // debounce: un solo save tras el flujo
    await new Promise((r) => setTimeout(r, 850));
    const saves = ipcCalls().filter((c) => c.cmd === 'usage_save');
    expect(saves.length).toBeGreaterThan(calls0);
  });

  it('record ignora generaciones sin tokens', () => {
    useUsageStore.getState().record('glm', 0, 0);
    expect(useUsageStore.getState().events.length).toBe(0);
  });

  it('setBudgets persiste los presupuestos', () => {
    onInvoke('usage_save', async () => undefined);
    useUsageStore.getState().setBudgets({ weekBudget: 5_000_000 });
    expect(useUsageStore.getState().weekBudget).toBe(5_000_000);
    expect(useUsageStore.getState().sessionBudget).toBe(500_000);
  });

  it('load hidrata eventos y presupuestos desde usage.json', async () => {
    const events: UsageEvent[] = [{ ts: 1, model: 'glm', promptTokens: 1, completionTokens: 2 }];
    onInvoke('usage_load', async () =>
      JSON.stringify({ events, sessionBudget: 100, weekBudget: 200 }),
    );
    await useUsageStore.getState().load();
    const s = useUsageStore.getState();
    expect(s.events).toEqual(events);
    expect(s.sessionBudget).toBe(100);
    expect(s.weekBudget).toBe(200);
  });

  it('load tolera null y corrupto', async () => {
    onInvoke('usage_load', async () => null);
    await useUsageStore.getState().load();
    expect(useUsageStore.getState().events).toEqual([]);
    onInvoke('usage_load', async () => '{corrupto');
    await useUsageStore.getState().load();
    expect(useUsageStore.getState().events).toEqual([]);
  });

  it('setApiKey recorta espacios y persiste (v2.2)', async () => {
    onInvoke('usage_save', async () => undefined);
    useUsageStore.getState().setApiKey('  ok_123  ');
    expect(useUsageStore.getState().ollamaApiKey).toBe('ok_123');
    const saves = ipcCalls().filter((c) => c.cmd === 'usage_save');
    expect(saves.length).toBe(1);
    expect(saves[0].args.data as string).toContain('"ollamaApiKey":"ok_123"');
  });

  it('load hidrata la API key (v2.2)', async () => {
    onInvoke('usage_load', async () =>
      JSON.stringify({ events: [], ollamaApiKey: 'sk_test' }),
    );
    await useUsageStore.getState().load();
    expect(useUsageStore.getState().ollamaApiKey).toBe('sk_test');
  });
});
