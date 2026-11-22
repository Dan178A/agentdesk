import { describe, it, expect } from 'vitest';
import { splitCodeBlocks } from './markdown';

describe('splitCodeBlocks', () => {
  it('bloque con lenguaje', () => {
    const md = 'texto\n```python\nprint(1)\n```\nmás texto';
    expect(splitCodeBlocks(md)).toEqual([{ lang: 'python', code: 'print(1)\n' }]);
  });

  it('bloque sin lenguaje', () => {
    const md = '```\nsin lang\n```';
    expect(splitCodeBlocks(md)).toEqual([{ lang: undefined, code: 'sin lang\n' }]);
  });

  it('sin bloques', () => {
    expect(splitCodeBlocks('solo texto plano')).toEqual([]);
  });

  it('dos bloques en orden', () => {
    const md = '```js\na()\n```\nmedio\n```rust\nfn main() {}\n```';
    expect(splitCodeBlocks(md)).toEqual([
      { lang: 'js', code: 'a()\n' },
      { lang: 'rust', code: 'fn main() {}\n' },
    ]);
  });

  it('bloque no cerrado no cuenta', () => {
    const md = '```js\ncódigo abierto sin cerrar';
    expect(splitCodeBlocks(md)).toEqual([]);
  });
});
