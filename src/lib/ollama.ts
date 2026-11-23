import { invoke, Channel } from '@tauri-apps/api/core';

/** Chunk del streaming — igual al StreamChunk del Rust (spec §5). */
export type Chunk =
  | { type: 'thinking'; id: string; delta: string }
  | { type: 'content'; id: string; delta: string }
  | {
      type: 'done';
      id: string;
      thinkingMs: number;
      promptTokens?: number;
      completionTokens?: number;
    }
  | { type: 'error'; id: string; message: string };

/** Mensaje que viaja a Ollama. */
export interface ChatMsg {
  role: string;
  content: string;
}

export interface StreamChatParams {
  id: string;
  ollamaUrl: string;
  model: string;
  messages: ChatMsg[];
  think: boolean;
}

/** Inicia una generación; los chunks llegan vía Channel. Retorna handle para stop. */
export async function streamChat(params: StreamChatParams, onChunk: (c: Chunk) => void) {
  const channel = new Channel<Chunk>();
  channel.onmessage = onChunk;
  await invoke('chat_start', {
    id: params.id,
    ollamaUrl: params.ollamaUrl,
    model: params.model,
    messages: params.messages,
    think: params.think,
    onChunk: channel,
  });
  return {
    stop: () => invoke('chat_stop', { id: params.id }),
  };
}

/**
 * Genera un título corto para la conversación (v2.6, llamada oculta).
 * `null` si el modelo falló o respondió algo inservible.
 */
export async function generateTitle(
  ollamaUrl: string,
  model: string,
  userText: string,
  replyText: string,
): Promise<string | null> {
  const prompt =
    'Genera un título corto (máximo 6 palabras, sin comillas ni punto final, en español) ' +
    'que describa el tema de esta conversación. Responde SOLO con el título.\n\n' +
    `Mensaje del usuario: ${userText.slice(0, 1000)}\n\nRespuesta (resumen): ${replyText.slice(0, 1500)}`;
  let content = '';
  try {
    await streamChat(
      { id: `title-${crypto.randomUUID()}`, ollamaUrl, model, messages: [{ role: 'user', content: prompt }], think: false },
      (c) => {
        if (c.type === 'content') content += c.delta;
        if (c.type === 'error') content = '';
      },
    );
  } catch {
    return null;
  }
  const clean = content
    .replace(/^["'«»\s:]+|["'«»\s.]+$/g, '')
    .split('\n')[0]
    .trim();
  if (!clean || clean.length < 4 || clean.length > 80) return null;
  return clean.slice(0, 60);
}
