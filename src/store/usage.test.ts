import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUsageStore } from './usage';
import { onInvoke, resetIpc, ipcCalls } from '../test/mock-ipc';
import type { UsageEvent } from '../lib/usage';

beforeEach(() => {
  resetIpc();
  onInvoke('set_ollama_api_key', async () => undefined);
  onInvoke('get_ollama_api_key', async () => null);
  useUsageStore.setState({ events: [], sessionBudget: 500_000, weekBudget: 2_000_000, ollamaApiKey: '' });
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

  it('setApiKey va al credential manager, NO a usage.json (v2.2)', async () => {
    onInvoke('usage_save', async () => undefined);
    useUsageStore.getState().setApiKey('  ok_123  ');
    expect(useUsageStore.getState().ollamaApiKey).toBe('ok_123');
    const setCalls = ipcCalls().filter((c) => c.cmd === 'set_ollama_api_key');
    expect(setCalls.length).toBe(1);
    expect(setCalls[0].args.key).toBe('ok_123');
    // ningún usage_save lleva el secreto
    await new Promise((r) => setTimeout(r, 850));
    for (const save of ipcCalls().filter((c) => c.cmd === 'usage_save')) {
      expect(save.args.data as string).not.toContain('ollamaApiKey');
      expect(save.args.data as string).not.toContain('ok_123');
    }
  });

  it('loadApiKey trae la clave del credential manager (v2.2)', async () => {
    onInvoke('get_ollama_api_key', async () => 'sk_del_manager');
    await useUsageStore.getState().loadApiKey();
    expect(useUsageStore.getState().ollamaApiKey).toBe('sk_del_manager');
  });

  it('load migra una clave en claro vieja: credential manager + usage.json limpio (v2.2)', async () => {
    const events = [{ ts: 1, model: 'glm', promptTokens: 1, completionTokens: 2 }];
    onInvoke('usage_load', async () =>
      JSON.stringify({ events, ollamaApiKey: 'sk_vieja_en_claro' }),
    );
    await useUsageStore.getState().load();
    // 1. la clave fue al credential manager
    const setCalls = ipcCalls().filter((c) => c.cmd === 'set_ollama_api_key');
    expect(setCalls.length).toBe(1);
    expect(setCalls[0].args.key).toBe('sk_vieja_en_claro');
    // 2. usage.json fue reescrito sin el secreto
    const saves = ipcCalls().filter((c) => c.cmd === 'usage_save');
    expect(saves.length).toBe(1);
    const data = saves[0].args.data as string;
    expect(data).not.toContain('sk_vieja_en_claro');
    expect(data).not.toContain('ollamaApiKey');
    // 3. la sesión actual usa la clave migrada
    expect(useUsageStore.getState().ollamaApiKey).toBe('sk_vieja_en_claro');
  });

  it('load ya no hidrata la clave desde usage.json (v2.2, solo credential manager)', async () => {
    onInvoke('usage_load', async () => JSON.stringify({ events: [] }));
    onInvoke('get_ollama_api_key', async () => 'sk_test');
    await useUsageStore.getState().load();
    await useUsageStore.getState().loadApiKey();
    expect(useUsageStore.getState().ollamaApiKey).toBe('sk_test');
  });
});
