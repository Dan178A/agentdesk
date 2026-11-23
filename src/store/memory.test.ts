import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useMemoryStore,
  buildMemorySystem,
  DEFAULT_MEMORY_PATH,
  MEMORY_MAX_CHARS,
} from './memory';
import { onInvoke, resetIpc, ipcCalls } from '../test/mock-ipc';
import type { FileRead } from '../lib/fsFiles';

function file(name: string, content: string): FileRead {
  return { name, extension: '', content, isBinary: false, sizeBytes: content.length };
}

beforeEach(() => {
  resetIpc();
  onInvoke('memory_save', async () => undefined);
  onInvoke('memory_load', async () => null);
  onInvoke('read_dir_files', async () => []);
  useMemoryStore.setState({
    path: DEFAULT_MEMORY_PATH,
    active: false,
    files: [],
    error: null,
    loading: false,
  });
});

describe('store de memoria', () => {
  it('init hidrata path y active desde memory.json y recarga si estaba activa', async () => {
    onInvoke('memory_load', async () => JSON.stringify({ path: 'C:\\otra\\memoria', active: true }));
    onInvoke('read_dir_files', async () => [file('memory/proyectos.md', 'contenido x')]);
    await useMemoryStore.getState().init();
    const s = useMemoryStore.getState();
    expect(s.path).toBe('C:\\otra\\memoria');
    expect(s.active).toBe(true);
    expect(s.files.length).toBe(1);
  });

  it('init tolera null y corrupto', async () => {
    onInvoke('memory_load', async () => null);
    await useMemoryStore.getState().init();
    expect(useMemoryStore.getState().active).toBe(false);
    onInvoke('memory_load', async () => '{roto');
    await useMemoryStore.getState().init();
    expect(useMemoryStore.getState().active).toBe(false);
  });

  it('toggle activa y carga; desactivar no recarga archivos', async () => {
    onInvoke('read_dir_files', async () => [file('MEMORY.md', 'índice')]);
    await useMemoryStore.getState().toggle();
    expect(useMemoryStore.getState().active).toBe(true);
    expect(useMemoryStore.getState().files.length).toBe(1);
    await useMemoryStore.getState().toggle();
    expect(useMemoryStore.getState().active).toBe(false);
    expect(useMemoryStore.getState().files.length).toBe(1); // se conservan para reactivar rápido
  });

  it('toggle persiste el estado en memory.json', async () => {
    await useMemoryStore.getState().toggle();
    await new Promise((r) => setTimeout(r, 30));
    const saves = ipcCalls().filter((c) => c.cmd === 'memory_save');
    expect(saves.length).toBe(1);
    expect(saves[0].args.data as string).toContain('"active":true');
  });

  it('error de carpeta → error visible y sin crash', async () => {
    onInvoke('read_dir_files', async () => {
      throw new Error('No se pudo');
    });
    await useMemoryStore.getState().toggle();
    expect(useMemoryStore.getState().active).toBe(true);
    expect(useMemoryStore.getState().error).toContain('No se pudo');
    expect(useMemoryStore.getState().files).toEqual([]);
  });
});

describe('buildMemorySystem', () => {
  it('vacio → cadena vacía', () => {
    expect(buildMemorySystem([])).toBe('');
  });

  it('combina archivos con encabezado y rutas relativas', () => {
    const text = buildMemorySystem([file('memory/proyectos.md', 'lista'), file('MEMORY.md', 'índice')]);
    expect(text).toContain('memoria de proyectos');
    expect(text).toContain('— archivo: memory/proyectos.md —');
    expect(text).toContain('índice');
  });

  it('recorta al presupuesto sin reventar el prompt', () => {
    const big = file('grande.md', 'x'.repeat(MEMORY_MAX_CHARS + 5000));
    const text = buildMemorySystem([big, file('chico.md', 'chico')]);
    expect(text.length).toBeLessThan(MEMORY_MAX_CHARS + 300);
    expect(text).toContain('recortada');
    expect(text).not.toContain('chico'); // el que no cabía quedó fuera
  });
});
