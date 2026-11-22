import { vi } from 'vitest';

/**
 * Mock de @tauri-apps/api/core para todos los tests TS.
 * Los handlers se registran con onInvoke(cmd, handler); los tests emiten
 * chunks llamando args.onChunk.onmessage({...}) dentro del handler de chat_start.
 */
const state = {
  calls: [] as Array<{ cmd: string; args: Record<string, unknown> }>,
  handlers: new Map<string, (args: Record<string, unknown>) => unknown>(),
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    state.calls.push({ cmd, args });
    const handler = state.handlers.get(cmd);
    if (!handler) throw new Error(`invoke sin mock registrado: ${cmd}`);
    return handler(args);
  }),
  Channel: class MockChannel<T> {
    onmessage: ((msg: T) => void) | null = null;
    toJSON() {
      return '__CHANNEL_MOCK__';
    }
  },
}));

export function resetIpc() {
  state.calls.length = 0;
  state.handlers.clear();
}

export function onInvoke(cmd: string, handler: (args: Record<string, unknown>) => unknown) {
  state.handlers.set(cmd, handler);
}

export function ipcCalls() {
  return state.calls as ReadonlyArray<{ cmd: string; args: Record<string, unknown> }>;
}

export function countCalls(cmd: string) {
  return state.calls.filter((c) => c.cmd === cmd).length;
}
