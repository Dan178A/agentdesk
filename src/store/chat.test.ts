import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore, buildMessages } from '../store/chat';
import { usePreviewStore } from '../store/preview';
import { onInvoke, resetIpc, countCalls, ipcCalls } from '../test/mock-ipc';
import type { Chunk } from '../lib/ollama';

const MODEL = 'glm-5.3-flash:cloud';

function resetStore() {
  useChatStore.setState(
    {
      chats: [],
      activeChatId: null,
      isGenerating: false,
      generationId: null,
      ollamaUrl: 'http://localhost:11434',
      defaultModel: MODEL,
      skillDir: undefined,
      skillContent: undefined,
    },
    false,
  );
}

/** Handler de chat_start que emite los chunks dados y resuelve. */
function scriptChat(chunks: Chunk[]) {
  onInvoke('chat_start', async (args) => {
    const ch = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
    for (const c of chunks) {
      ch.onmessage?.({ ...c, id: args.id as string });
    }
  });
}

beforeEach(() => {
  resetIpc();
  resetStore();
  useChatStore.getState().init();
});

describe('store de chat', () => {
  it('init crea un chat activo', () => {
    const s = useChatStore.getState();
    expect(s.chats.length).toBe(1);
    expect(s.activeChatId).toBe(s.chats[0].id);
  });

  it('(a) sendMessage agrega user + assistant y marca isGenerating', async () => {
    scriptChat([]); // stream que no termina
    await useChatStore.getState().sendMessage('hola', MODEL);
    const chat = useChatStore.getState().chats[0];
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(chat.messages[0].content).toBe('hola');
    expect(useChatStore.getState().isGenerating).toBe(true);
  });

  it('(b+c) chunks thinking y content acumulan en el assistant', async () => {
    scriptChat([
      { type: 'thinking', id: 'x', delta: 'Estoy ' },
      { type: 'thinking', id: 'x', delta: 'pensando' },
      { type: 'content', id: 'x', delta: 'Hola, ' },
      { type: 'content', id: 'x', delta: '¿qué tal?' },
    ]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    const assistant = useChatStore.getState().chats[0].messages[1];
    expect(assistant.thinking).toBe('Estoy pensando');
    expect(assistant.content).toBe('Hola, ¿qué tal?');
  });

  it('(d) done setea thinkingMs y libera isGenerating', async () => {
    scriptChat([
      { type: 'content', id: 'x', delta: 'respuesta' },
      { type: 'done', id: 'x', thinkingMs: 1234 },
    ]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    const assistant = useChatStore.getState().chats[0].messages[1];
    expect(assistant.thinkingMs).toBe(1234);
    expect(useChatStore.getState().isGenerating).toBe(false);
  });

  it('(e) error tras contenido parcial: conserva el parcial, marca error y no queda generando (Review Focus 1)', async () => {
    scriptChat([
      { type: 'content', id: 'x', delta: 'parcial' },
      { type: 'error', id: 'x', message: 'connection reset' },
    ]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    const assistant = useChatStore.getState().chats[0].messages[1];
    expect(assistant.content).toBe('parcial');
    expect(assistant.error).toBe('connection reset');
    expect(useChatStore.getState().isGenerating).toBe(false);
  });

  it('(f) sendMessage durante generación no lanza otro chat_start (Review Focus 2)', async () => {
    scriptChat([]); // nunca termina
    await useChatStore.getState().sendMessage('primero', MODEL);
    await useChatStore.getState().sendMessage('segundo', MODEL);
    expect(countCalls('chat_start')).toBe(1);
  });

  it('(g) stopActive invoca chat_stop y el done marca "detenido por el usuario"', async () => {
    let channel: { onmessage: ((m: Chunk) => void) | null } | null = null;
    let genId = '';
    onInvoke('chat_start', async (args) => {
      channel = args.onChunk as { onmessage: ((m: Chunk) => void) | null };
      genId = args.id as string;
    });
    await useChatStore.getState().sendMessage('hola', MODEL);
    useChatStore.getState().stopActive();
    expect(countCalls('chat_stop')).toBe(1);
    // Rust emite done tras la cancelación
    channel!.onmessage?.({ type: 'done', id: genId, thinkingMs: 50 });
    const assistant = useChatStore.getState().chats[0].messages[1];
    expect(assistant.stopped).toBe(true);
    expect(useChatStore.getState().isGenerating).toBe(false);
  });

  it('(h) buildMessages pone el system del skill antes del historial', async () => {
    const s = useChatStore.getState();
    s.setSkill('ui-styling', 'Contenido del skill de styling');
    await scriptChat([]);
    await useChatStore.getState().sendMessage('diseña un botón', MODEL);
    const chat = useChatStore.getState().chats[0];
    const msgs = buildMessages(chat);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('Contenido del skill de styling');
    // El placeholder assistant vacío NO va al request: system + user
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('(i) título automático = primeras ~40 chars del primer mensaje', async () => {
    scriptChat([]);
    await useChatStore.getState().sendMessage(
      'Este es un mensaje muy largo que deberia truncarse en el titulo del chat automaticamente',
      MODEL,
    );
    const chat = useChatStore.getState().chats[0];
    expect(chat.title).toBe('Este es un mensaje muy largo que deberia');
    expect(chat.title.length).toBe(40);
  });

  it('clearSkill quita el skill activo', () => {
    useChatStore.getState().setSkill('design', 'Contenido');
    expect(useChatStore.getState().skillDir).toBe('design');
    useChatStore.getState().clearSkill();
    expect(useChatStore.getState().skillDir).toBeUndefined();
    const msgs = buildMessages(useChatStore.getState().chats[0]);
    expect(msgs.length).toBe(0); // sin skill y sin mensajes: no hay system
    expect(msgs.every((m) => m.role !== 'system')).toBe(true);
  });

  it('(v2.0) done con skill «interfaz» abre el HTML en el panel de vista previa', async () => {
    usePreviewStore.setState({ open: false, content: null });
    const html = '```html\n<!DOCTYPE html><html><title>Panel de ventas</title><body>hola</body></html>\n```';
    useChatStore.getState().setSkill('interfaz', 'prompt de interfaz');
    scriptChat([{ type: 'content', id: 'x', delta: html }, { type: 'done', id: 'x', thinkingMs: 10 }]);
    await useChatStore.getState().sendMessage('dashboard de ventas', MODEL);
    const p = usePreviewStore.getState();
    expect(p.open).toBe(true);
    expect(p.content?.kind).toBe('html');
    expect(p.content?.title).toBe('Panel de ventas');
  });

  it('(v2.0) done sin skill interfaz NO abre el panel', async () => {
    usePreviewStore.setState({ open: false, content: null });
    scriptChat([{ type: 'content', id: 'x', delta: '```html\n<b>x</b>\n```' }, { type: 'done', id: 'x', thinkingMs: 10 }]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    expect(usePreviewStore.getState().open).toBe(false);
  });

  it('think se envía según capability del modelo (spec §7.1)', async () => {
    scriptChat([]);
    useChatStore.getState().setModels([{ id: 'gemma3:4b', name: 'gemma3:4b', canThink: false }]);
    await useChatStore.getState().sendMessage('hola', 'gemma3:4b');
    const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
    expect(call.args.think).toBe(false);
  });

  it('deleteChat del activo activa otro chat', () => {
    useChatStore.getState().newChat();
    const active = useChatStore.getState().activeChatId!;
    useChatStore.getState().deleteChat(active);
    expect(useChatStore.getState().activeChatId).not.toBe(active);
    expect(useChatStore.getState().chats.every((c) => c.id !== active)).toBe(true);
  });

  it('deleteChat del último chat crea uno nuevo', () => {
    const only = useChatStore.getState().chats[0];
    useChatStore.getState().deleteChat(only.id);
    expect(useChatStore.getState().chats.length).toBe(1);
    expect(useChatStore.getState().activeChatId).toBeTruthy();
  });

  it('(v1.1) done con tokens reales setea chat.tokensUsed', async () => {
    scriptChat([
      { type: 'content', id: 'x', delta: 'respuesta' },
      { type: 'done', id: 'x', thinkingMs: 10, promptTokens: 120, completionTokens: 8 },
    ]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    expect(useChatStore.getState().chats[0].tokensUsed).toBe(128);
  });

  it('(v1.1) retryLast elimina el assistant fallido y reenvía el user', async () => {
    scriptChat([{ type: 'error', id: 'x', message: 'conexión caída' }]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    expect(useChatStore.getState().isGenerating).toBe(false);

    // segunda generación: exitosa
    scriptChat([
      { type: 'content', id: 'x', delta: 'regenerado' },
      { type: 'done', id: 'x', thinkingMs: 1 },
    ]);
    await useChatStore.getState().retryLast();
    const chat = useChatStore.getState().chats[0];
    // quedó: user + assistant regenerado (sin el fallido duplicado)
    expect(chat.messages.length).toBe(2);
    expect(countCalls('chat_start')).toBe(2);
    expect(chat.messages[0].role).toBe('user');
    expect(chat.messages[1].content).toBe('regenerado');
  });
});
