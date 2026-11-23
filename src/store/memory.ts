import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { readFilesInFolder, type FileRead } from '../lib/fsFiles';

/** Presupuesto de caracteres de memoria por mensaje del sistema. */
export const MEMORY_MAX_CHARS = 80_000;

/** Ruta default: la memoria de proyectos del usuario (configurable). */
export const DEFAULT_MEMORY_PATH =
  'C:\\Users\\DAN_PC\\Documents\\GitHub\\claude-memory-2026-11-22';

interface MemoryState {
  path: string;
  active: boolean;
  files: FileRead[];
  error: string | null;
  loading: boolean;
  setPath: (path: string) => void;
  /** Activa/desactiva la memoria; al activar carga los archivos. */
  toggle: () => Promise<void>;
  /** Recarga los archivos de la carpeta configurada. */
  reload: () => Promise<void>;
  /** Init de la app: hidrata path/active desde memory.json. */
  init: () => Promise<void>;
}

/** Texto de memoria combinado y acotado (puro, para tests). */
export function buildMemorySystem(files: FileRead[], maxChars = MEMORY_MAX_CHARS): string {
  if (files.length === 0) return '';
  let body = '';
  let truncated = false;
  for (const f of files) {
    const block = `— archivo: ${f.name} —\n${f.content}\n\n`;
    if (body.length + block.length > maxChars) {
      truncated = true;
      break;
    }
    body += block;
  }
  const head =
    'Eres consciente de la memoria de proyectos del usuario: estos archivos describen sus ' +
    'proyectos, decisiones y estado real. Úsalos como contexto permanente y responde en ese marco.\n\n';
  return head + body + (truncated ? '(memoria recortada por tamaño)\n' : '');
}

async function persist(state: Pick<MemoryState, 'path' | 'active'>) {
  try {
    await invoke('memory_save', {
      data: JSON.stringify({ path: state.path, active: state.active }),
    });
  } catch {
    // sin persistencia disponible
  }
}

/**
 * Memoria integrada (v2.4): una carpeta de fichas que se inyecta como system prompt
 * en todos los chats. La ruta y el estado viven en memory.json (sin secretos, solo la ruta).
 */
export const useMemoryStore = create<MemoryState>((set, get) => ({
  path: DEFAULT_MEMORY_PATH,
  active: false,
  files: [],
  error: null,
  loading: false,

  setPath: (path) => {
    set({ path });
    void persist(get());
  },

  toggle: async () => {
    const turningOn = !get().active;
    set({ active: turningOn, error: null });
    void persist(get());
    if (turningOn) await get().reload();
  },

  reload: async () => {
    set({ loading: true, error: null });
    try {
      const files = await readFilesInFolder(get().path);
      set({
        files,
        loading: false,
        error: files.length === 0 ? 'La carpeta de memoria no tiene archivos de texto.' : null,
      });
    } catch (e) {
      set({ files: [], loading: false, error: String(e) });
    }
  },

  init: async () => {
    try {
      const raw = await invoke<string | null>('memory_load');
      if (raw) {
        const parsed = JSON.parse(raw) as { path?: string; active?: boolean };
        if (typeof parsed.path === 'string' && parsed.path.trim()) {
          set({ path: parsed.path });
        }
        if (parsed.active === true) {
          set({ active: true });
          await get().reload();
        }
      }
    } catch {
      // sin persistencia disponible
    }
  },
}));
