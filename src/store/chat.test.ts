import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore, buildMessages, TOOL_RESULT_MARKER } from '../store/chat';
import { usePreviewStore } from '../store/preview';
import { useMemoryStore } from '../store/memory';
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

  it('(v2.4) memoria activa entra primero como system y antes del skill (en el request real)', async () => {
    useMemoryStore.setState({ active: true, files: [{ name: 'memory/proyectos.md', extension: 'md', content: 'proyectos de Dan', isBinary: false, sizeBytes: 16 }] });
    useChatStore.getState().setSkill('ui-styling', 'System del skill');
    scriptChat([]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
    const msgs = call.args.messages as { role: string; content: string }[];
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('memoria de proyectos');
    expect(msgs[0].content).toContain('proyectos de Dan');
    expect(msgs[1].content).toBe('System del skill');
    useMemoryStore.setState({ active: false, files: [] });
  });

  it('(v2.4) memoria inactiva no inyecta system extra', async () => {
    useChatStore.getState().setSkill('ui-styling', 'System del skill');
    scriptChat([]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
    const msgs = call.args.messages as { role: string; content: string }[];
    expect(msgs[0].content).toBe('System del skill');
    expect(msgs.length).toBe(2);
  });

  it('(v2.5) carpeta adjuntada: sistema busca según la consulta y el chip se limpia al enviar', async () => {
    onInvoke('read_dir_files', async () => [
      { name: 'proyectos/dropaudio.md', extension: 'md', content: 'Tienda DropAudio de KZ: precios y Mercado Libre.', isBinary: false, sizeBytes: 50 },
      { name: 'datos/notas.txt', extension: 'txt', content: 'compras: pan leche café.', isBinary: false, sizeBytes: 30 },
    ]);
    await useChatStore.getState().addFolder('C:\\memoria');
    expect(useChatStore.getState().pendingFolders.length).toBe(1);
    expect(useChatStore.getState().pendingFolders[0].files.length).toBe(2);

    scriptChat([]);
    await useChatStore.getState().sendMessage('dime los precios de dropaudio', MODEL);
    const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
    const msgs = call.args.messages as { role: string; content: string }[];
    // el system de carpeta va después de memoria/skill (ninguno activo aquí): primero
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('adjuntó la carpeta «memoria»');
    expect(msgs[0].content).toContain('Tienda DropAudio'); // el archivo relevante está
    expect(msgs[0].content).not.toContain('pan leche café'); // el que no coincide, fuera
    // el chip se limpia tras el envío (adjunto de un mensaje, como Claude Desktop)
    expect(useChatStore.getState().pendingFolders).toEqual([]);
  });

  it('(v2.5) sin coincidencias manda solo índice e instrucción', async () => {
    onInvoke('read_dir_files', async () => [
      { name: 'datos/notas.txt', extension: 'txt', content: 'compras: pan leche café.', isBinary: false, sizeBytes: 30 },
    ]);
    await useChatStore.getState().addFolder('C:\\memoria');
    scriptChat([]);
    await useChatStore.getState().sendMessage('explícame la fotosíntesis', MODEL);
    const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
    const msgs = call.args.messages as { role: string; content: string }[];
    expect(msgs[0].content).toContain('Ningún archivo coincide');
    expect(msgs[0].content).toContain('Índice de memoria');
    expect(useChatStore.getState().pendingFolders).toEqual([]);
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

  // Regression: ISSUE-002 — /qa 2026-11-22
  // Report: .gstack/qa-reports/qa-report-projects-2026-11-22.md
  it('deleteChat prefiere un chat del mismo proyecto (no salta a General)', () => {
    useChatStore.setState((s) => ({
      chats: [
        { ...s.chats[0], projectId: 'general' },
        { ...s.chats[0], id: 'c-drop-2', projectId: 'dropaudio', title: 'Drop 2' },
        { ...s.chats[0], id: 'c-drop-1', projectId: 'dropaudio', title: 'Drop 1' },
      ],
      activeChatId: 'c-drop-1',
    }));
    useChatStore.getState().deleteChat('c-drop-1');
    const s = useChatStore.getState();
    expect(s.activeChatId).toBe('c-drop-2'); // hermano del proyecto, no chats[0] global
    expect(s.chats.find((c) => c.id === s.activeChatId)?.projectId).toBe('dropaudio');
  });

  it('deleteChat del último chat de un proyecto crea el reemplazo en ESE proyecto', () => {
    useChatStore.setState((s) => ({
      chats: [
        { ...s.chats[0], id: 'c-gen', projectId: 'general' },
        { ...s.chats[0], id: 'c-drop-last', projectId: 'violin' },
      ],
      activeChatId: 'c-drop-last',
    }));
    useChatStore.getState().deleteChat('c-drop-last');
    const s = useChatStore.getState();
    expect(s.chats.find((c) => c.id === s.activeChatId)?.projectId).toBe('violin');
  });

  it('(v1.1) done con tokens reales setea chat.tokensUsed', async () => {
    scriptChat([
      { type: 'content', id: 'x', delta: 'respuesta' },
      { type: 'done', id: 'x', thinkingMs: 10, promptTokens: 120, completionTokens: 8 },
    ]);
    await useChatStore.getState().sendMessage('hola', MODEL);
    expect(useChatStore.getState().chats[0].tokensUsed).toBe(128);
  });

  // Regression: modo agente (v2.7) — /qa-adjacente
  const TOOL_REPLY =
    'Investigo:\n```tool\n{"tool":"search_folder","args":{"path":"C:/memoria","query":"dropaudio"}}\n```';
  const FINAL_REPLY = 'Según lo encontrado: KZ cuesta 399 USD.';

  describe('modo agente', () => {
    beforeEach(() => {
      onInvoke('search_files', async () => [
        { file: 'proyectos/dropaudio.md', line: 2, content: 'KZ cuesta 399 USD' },
      ]);
    });

    it('ronda con herramienta: busca, inyecta resultados y responde al final', async () => {
      useChatStore.setState({ agentMode: true });
      const handlers: ((a: Record<string, unknown>) => Promise<void>)[] = [
        async (a) => {
          const ch = a.onChunk as { onmessage: ((m: Chunk) => void) | null };
          ch.onmessage?.({ type: 'content', delta: TOOL_REPLY, id: a.id as string } as unknown as Chunk);
          ch.onmessage?.({ type: 'done', thinkingMs: 5, id: a.id as string } as unknown as Chunk);
        },
        async (a) => {
          const ch = a.onChunk as { onmessage: ((m: Chunk) => void) | null };
          for (const m of (a.messages as { role: string; content: string }[])) {
            if (m.content.includes(TOOL_RESULT_MARKER)) {
              expect(m.content).toContain('proyectos/dropaudio.md'); // resultado inyectado
            }
          }
          ch.onmessage?.({ type: 'content', delta: FINAL_REPLY, id: a.id as string } as unknown as Chunk);
          ch.onmessage?.({ type: 'done', thinkingMs: 5, id: a.id as string } as unknown as Chunk);
        },
      ];
      let i = 0;
      onInvoke('chat_start', async (a) => {
        await handlers[Math.min(i, handlers.length - 1)](a as Record<string, unknown>);
        i += 1;
      });
      await useChatStore.getState().sendMessage('cuánto cuesta el KZ-900', MODEL);
      const call = ipcCalls().find((c) => c.cmd === 'search_files')!;
      expect(call.args.query).toBe('dropaudio');
      const msgs = useChatStore.getState().chats[0].messages;
      expect(msgs.some((m) => m.role === 'user' && m.content.startsWith(TOOL_RESULT_MARKER))).toBe(true);
      expect(msgs[msgs.length - 1].content).toBe(FINAL_REPLY);
      expect(useChatStore.getState().isGenerating).toBe(false);
      expect(useChatStore.getState().toolLog[0].ok).toBe(true);
    });

    it('el system prompt del agente va solo en modo agente', async () => {
      useChatStore.setState({ agentMode: false });
      scriptChat([{ type: 'content', id: 'x', delta: 'hola' }, { type: 'done', id: 'x', thinkingMs: 1 }]);
      await useChatStore.getState().sendMessage('hola', MODEL);
      const call = ipcCalls().find((c) => c.cmd === 'chat_start')!;
      const sys = (call.args.messages as { role: string; content: string }[]).filter((m) => m.role === 'system');
      expect(sys.every((m) => !m.content.includes('MODO AGENTE'))).toBe(true);

      useChatStore.setState({ agentMode: true });
      scriptChat([]);
      await useChatStore.getState().sendMessage('hola', MODEL);
      const call2 = ipcCalls().filter((c) => c.cmd === 'chat_start')[1]!;
      const sys2 = (call2.args.messages as { role: string; content: string }[])[0];
      expect(sys2.content).toContain('MODO AGENTE');
    });

    it('run_command queda PENDIENTE de autorizar; rechazar inyecta el fallo y reanuda', async () => {
      useChatStore.setState({ agentMode: true });
      const CMD_REPLY =
        'Ejecuto:\n```tool\n{"tool":"run_command","args":{"cmd":"dir C:/dropaudio"}}\n```';
      let n = 0;
      onInvoke('chat_start', async (a) => {
        n += 1;
        const ch = a.onChunk as { onmessage: ((m: Chunk) => void) | null };
        const delta = n === 1 ? CMD_REPLY : FINAL_REPLY;
        ch.onmessage?.({ type: 'content', delta, id: a.id as string } as unknown as Chunk);
        ch.onmessage?.({ type: 'done', thinkingMs: 5, id: a.id as string } as unknown as Chunk);
      });
      // Primera ronda: queda pausada esperando autorización
      await useChatStore.getState().sendMessage('lista los archivos', MODEL);
      expect(useChatStore.getState().pendingCommand?.args.cmd).toBe('dir C:/dropaudio');
      expect(useChatStore.getState().isGenerating).toBe(true);
      expect(useChatStore.getState().toolLog.length).toBe(0); // aún no se ejecutó

      // Rechazar → resultado con el rechazo y reanudación hasta la respuesta final
      await useChatStore.getState().confirmCommand(false);
      expect(useChatStore.getState().pendingCommand).toBeNull();
      const msgs = useChatStore.getState().chats[0].messages;
      expect(msgs.some((m) => m.content.includes('El usuario rechazó el comando'))).toBe(true);
      expect(msgs[msgs.length - 1].content).toBe(FINAL_REPLY);
      expect(useChatStore.getState().toolLog[0].ok).toBe(false);
    });
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
