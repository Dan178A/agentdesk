import { describe, it, expect } from 'vitest';
import { filterItems, handleMenuKey, type MenuItem } from './slashMenu';

const ITEMS: MenuItem[] = [
  { name: 'model', description: 'Cambiar el modelo del chat', kind: 'builtin', builtin: true },
  { name: 'ui-styling', description: 'Componentes accesibles shadcn Tailwind', kind: 'skill', dir: 'ui-styling' },
  { name: 'design-system', description: 'Tokens de diseño en tres capas', kind: 'skill', dir: 'design-system' },
  { name: 'ui-ux-pro-max', description: 'Inteligencia UI/UX con estilos', kind: 'skill', dir: 'ui-ux-pro-max' },
];

describe('filterItems', () => {
  it('"sty" matchea por nombre', () => {
    const r = filterItems(ITEMS, 'sty');
    expect(r.map((i) => i.name)).toEqual(['ui-styling']);
  });

  it('"capas" matchea por descripción', () => {
    const r = filterItems(ITEMS, 'capas');
    expect(r.map((i) => i.name)).toEqual(['design-system']);
  });

  it('query vacía devuelve todo', () => {
    expect(filterItems(ITEMS, '').length).toBe(ITEMS.length);
  });

  it('sin matches devuelve []', () => {
    expect(filterItems(ITEMS, 'zzzz')).toEqual([]);
  });

  it('el filtro es case-insensitive', () => {
    expect(filterItems(ITEMS, 'UI-UX').map((i) => i.name)).toEqual(['ui-ux-pro-max']);
  });
});

describe('handleMenuKey', () => {
  it('ArrowDown desde -1 va a 0', () => {
    expect(handleMenuKey('ArrowDown', -1, 4)).toEqual({ action: 'move', index: 0 });
  });
  it('ArrowDown wrap desde el último', () => {
    expect(handleMenuKey('ArrowDown', 3, 4)).toEqual({ action: 'move', index: 0 });
  });
  it('ArrowUp desde 0 wrap al último', () => {
    expect(handleMenuKey('ArrowUp', 0, 4)).toEqual({ action: 'move', index: 3 });
  });
  it('ArrowUp desde -1 va al último', () => {
    expect(handleMenuKey('ArrowUp', -1, 4)).toEqual({ action: 'move', index: 3 });
  });
  it('Enter selecciona', () => {
    expect(handleMenuKey('Enter', 2, 4)).toEqual({ action: 'select', index: 2 });
  });
  it('Escape cierra', () => {
    expect(handleMenuKey('Escape', 1, 4)).toEqual({ action: 'close', index: -1 });
  });
  it('otra tecla no hace nada', () => {
    expect(handleMenuKey('a', 1, 4)).toEqual({ action: 'none', index: 1 });
  });
});
