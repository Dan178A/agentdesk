import type { FileRead } from './fsFiles';

export interface FolderRoot {
  /** Ruta absoluta como la eligió el usuario. */
  path: string;
  /** Último segmento, para el chip. */
  name: string;
  files: FileRead[];
}

/** Presupuesto por mensaje de envío de carpetas y tope de líneas del índice. */
export const FOLDER_CONTEXT_BUDGET = 30_000;
export const INDEX_MAX_ENTRIES = 150;

/** Consulta → tokens de búsqueda (≥3 chars, en minúsculas). */
function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['que', 'los', 'las', 'por', 'una', 'para', 'del', 'este', 'esta'].includes(w));
}

/** Puntaje de un archivo para una consulta: coincidencias de contenido y nombre. */
export function scoreFile(f: FileRead, tokens: string[]): number {
  let score = 0;
  const lowerContent = f.content.toLowerCase();
  const lowerName = f.name.toLowerCase();
  for (const t of tokens) {
    for (const haystack of [lowerContent, lowerName]) {
      let idx = 0;
      // cuenta hasta 5 apariciones por token por fuente (evita explotar en archivos enormes)
      let count = 0;
      while (count < 5) {
        idx = haystack.indexOf(t, idx);
        if (idx === -1) break;
        score += haystack === lowerName ? 3 : 1;
        idx += t.length;
        count += 1;
      }
    }
  }
  return score;
}

/**
 * Contexto de carpeta para un mensaje (v2.5): el sistema busca en los archivos
 * de la carpeta según la consulta y entrega los relevantes, tipo Claude.
 */
export function buildFolderSystem(
  roots: FolderRoot[],
  query: string,
  budget = FOLDER_CONTEXT_BUDGET,
): string {
  const parts: string[] = [];
  const tokens = queryTokens(query);
  let used = 0;

  for (const root of roots) {
    // índice acotado: con 900+ archivos, listarlos todos comería el presupuesto
    const listed = root.files.slice(0, INDEX_MAX_ENTRIES);
    const more = root.files.length - listed.length;
    const head =
      `El usuario adjuntó la carpeta «${root.name}» (${root.files.length} archivos de texto). ` +
      'A continuación van los archivos relevantes para la petición, por orden de coincidencia. ' +
      'Si necesitas otro archivo del índice, pídelo por nombre en tu respuesta.\n\n' +
      `Índice de ${root.name} (${root.files.length}):\n` +
      listed.map((f) => `- ${f.name} (${f.sizeBytes} B)`).join('\n') +
      (more > 0 ? `\n… y ${more} archivos más (pídelos por nombre si los necesitas)` : '');
    parts.push(head);
    used += head.length;

    const scored = root.files
      .map((f) => ({ f, score: scoreFile(f, tokens) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    let any = false;
    for (const { f } of scored) {
      const block = `\n\n— archivo: ${f.name} —\n${f.content}`;
      if (used + block.length > budget) {
        parts.push('\n\n(…) hay más coincidencias que no cupieron en el contexto');
        any = true;
        break;
      }
      parts.push(block);
      used += block.length;
      any = true;
    }
    if (!any) {
      parts.push(
        '\n\nNingún archivo coincide con la consulta: usa el índice y pide el archivo que necesites.',
      );
    }
  }

  if (parts.length === 0) return '';
  return (
    'Has recibido adjuntos en una carpeta del usuario. Son contexto de este mensaje.\n\n' +
    parts.join('')
  );
}
