import { splitCodeBlocks } from './markdown';

/** Tipos de contenido que el panel sabe renderizar (plan v2.0 Fase 2). */
export type PreviewKind = 'html' | 'markdown' | 'csv' | 'image';

export interface PreviewContent {
  kind: PreviewKind;
  title: string;
  /** Texto (html/md/csv) o data-URI (image). */
  text: string;
}

const IMAGE_DATA_URI = /!\[[^\]]*\]\((data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)/;

/** Extrae la vista previa de un mensaje: primer bloque con HTML/md/csv completo, o imagen data-URI. */
export function extractPreview(content: string): PreviewContent | null {
  const imageMatch = IMAGE_DATA_URI.exec(content);
  if (imageMatch) {
    return { kind: 'image', title: 'Imagen', text: imageMatch[1] };
  }

  const blocks = splitCodeBlocks(content);
  let fallback: PreviewContent | null = null;
  for (const b of blocks) {
    const lang = (b.lang ?? '').toLowerCase();
    if (lang === 'html' || lang === 'htm') {
      const hasDoc = /<(!doctype|html)[\s>]/i.test(b.code);
      const preview: PreviewContent = {
        kind: 'html',
        title: titleFromHtml(b.code),
        text: b.code,
      };
      if (hasDoc) return preview; // documento completo manda
      fallback ??= preview; // fragmento: se recuerda por si no hay nada mejor
    } else if (lang === 'md' || lang === 'markdown') {
      fallback ??= { kind: 'markdown', title: 'Documento', text: b.code };
    } else if (lang === 'csv') {
      fallback ??= { kind: 'csv', title: 'Tabla', text: b.code };
    }
  }
  return fallback;
}

function titleFromHtml(code: string): string {
  const m = /<title>([^<]{1,80})<\/title>/i.exec(code);
  return m ? m[1].trim() : 'Vista previa web';
}

/** CSV mínimo: filas por línea, columnas por comas (respetando comillas simples del RFC no crítico en v2). */
export function parseCsv(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
}
