import { invoke } from '@tauri-apps/api/core';
import type { PreviewContent } from './preview';

export interface FileRead {
  name: string;
  extension: string;
  content: string;
  isBinary: boolean;
  sizeBytes: number;
}

/** Lee un archivo local (texto → contenido, imagen → data-URI). */
export function readFile(path: string): Promise<FileRead> {
  return invoke<FileRead>('read_file', { path });
}

/** Escribe un archivo (crea carpetas padre). */
export function writeFile(path: string, content: string): Promise<string> {
  return invoke<string>('write_file', { input: { path, content } });
}

/** Convierte un FileRead en preview (imágenes) o null (los textos van al mensaje). */
export function fileToPreview(f: FileRead): PreviewContent | null {
  if (!f.isBinary) return null;
  return { kind: 'image', title: f.name, text: f.content };
}

/** Lista los archivos de texto de una carpeta (recursivo, sin .git/node_modules/dotfiles). */
export function readFilesInFolder(path: string): Promise<FileRead[]> {
  return invoke<FileRead[]>('read_dir_files', { path });
}

/** Bloque markdown para inyectar un archivo de texto en el mensaje. */
export function fileToAttachment(f: FileRead): string {
  const lang = f.extension || 'txt';
  return `\n\n— archivo: ${f.name} —\n\`\`\`${lang}\n${f.content}\n\`\`\``;
}
