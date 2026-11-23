import { describe, it, expect } from 'vitest';
import { extractPreview, parseCsv } from './preview';

describe('extractPreview', () => {
  it('HTML completo con <title> → kind html y título del doc', () => {
    const md = 'Aquí tienes:\n```html\n<!DOCTYPE html><html><title>Mi app</title><body>hola</body></html>\n```\n';
    expect(extractPreview(md)).toEqual({ kind: 'html', title: 'Mi app', text: '<!DOCTYPE html><html><title>Mi app</title><body>hola</body></html>\n' });
  });

  it('HTML completo gana aunque haya un markdown antes', () => {
    const md = '```md\n# notas\n```\n```html\n<!DOCTYPE html><html><title>A</title></html>\n```';
    expect(extractPreview(md)?.kind).toBe('html');
  });

  it('html: sin título → «Vista previa web»', () => {
    const md = '```html\n<p>hola</p>\n```';
    expect(extractPreview(md)).toEqual({ kind: 'html', title: 'Vista previa web', text: '<p>hola</p>\n' });
  });

  it('markdown con fence md → kind markdown', () => {
    const md = '```markdown\n# Reporte\n- a\n```';
    expect(extractPreview(md)).toEqual({ kind: 'markdown', title: 'Documento', text: '# Reporte\n- a\n' });
  });

  it('csv con fence csv → kind csv', () => {
    const md = '```csv\nnombre,valor\nalpha,1\n```';
    expect(extractPreview(md)).toEqual({ kind: 'csv', title: 'Tabla', text: 'nombre,valor\nalpha,1\n' });
  });

  it('imagen data-URI en markdown → kind image', () => {
    const md = '![grafico](data:image/png;base64,AAAA) y texto';
    const p = extractPreview(md);
    expect(p?.kind).toBe('image');
    expect(p?.text).toBe('data:image/png;base64,AAAA');
  });

  it('imagen gana sobre html (orden de preferencia del parser)', () => {
    const md = '```html\n<b>x</b>\n```\n![i](data:image/png;base64,AAAA)';
    expect(extractPreview(md)?.kind).toBe('image');
  });

  it('bloques de código común (js/py) no generan preview', () => {
    expect(extractPreview('```js\nconst x = 1;\n```')).toBeNull();
    expect(extractPreview('texto normal sin bloques')).toBeNull();
    expect(extractPreview('')).toBeNull();
  });

  it('no revienta con contenido de streaming parcial (fence sin cerrar)', () => {
    expect(extractPreview('generando…\n```html\n<p')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('parsea filas y columnas', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('quita comillas y espacios', () => {
    expect(parseCsv('"nombre", "edad"\n"Ana", 33')).toEqual([['nombre', 'edad'], ['Ana', '33']]);
  });
  it('ignora líneas vacías y CR', () => {
    expect(parseCsv('a,b\r\n\r\n')).toEqual([['a', 'b']]);
  });
});
