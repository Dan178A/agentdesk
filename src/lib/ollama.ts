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
