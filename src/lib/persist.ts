import type { Chat } from '../store/chat';
import { DEFAULT_ALIASES } from './models';

export interface Settings {
  aliases: Record<string, string>;
  defaultModel: string;
  theme: 'system' | 'light' | 'dark';
  ollamaUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  aliases: DEFAULT_ALIASES,
  defaultModel: 'glm-5.3-flash:cloud',
  theme: 'system',
  ollamaUrl: 'http://localhost:11434',
};

/** Historial tolerante: JSON corrupto, null o estructura inválida → []. */
export function hydrateHistory(raw: string | null): Chat[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Chat =>
        !!c && typeof c === 'object' && typeof (c as Chat).id === 'string' &&
        Array.isArray((c as Chat).messages),
    );
  } catch {
    return [];
  }
}

export function serializeChats(chats: Chat[]): string {
  return JSON.stringify(chats);
}

/** Settings tolerante: merge con defaults para claves que falten. */
export function hydrateSettings(raw: string | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
