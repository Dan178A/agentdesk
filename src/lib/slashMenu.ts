import type { MenuItem } from './skills';

export type { MenuItem } from './skills';

/** Filtra items por substring case-insensitive sobre nombre y descripción. */
export function filterItems(items: MenuItem[], query: string): MenuItem[] {
  const q = query.toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
  );
}

export type MenuAction = { action: 'move' | 'select' | 'close' | 'none'; index: number };

/** Navegación por teclado del popup slash (wrap, Enter, Escape). */
export function handleMenuKey(key: string, index: number, length: number): MenuAction {
  if (length === 0) return { action: key === 'Escape' ? 'close' : 'none', index: -1 };
  switch (key) {
    case 'ArrowDown':
      return { action: 'move', index: (index + 1) % length };
    case 'ArrowUp':
      return { action: 'move', index: (index - 1 + length) % length };
    case 'Enter':
      return { action: 'select', index: index < 0 ? 0 : index };
    case 'Escape':
      return { action: 'close', index: -1 };
    default:
      return { action: 'none', index };
  }
}
