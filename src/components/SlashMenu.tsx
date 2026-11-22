import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../store/chat';
import { filterItems, handleMenuKey } from '../lib/slashMenu';
import type { MenuItem, SkillFile } from '../lib/skills';

/** Popup del menú slash: filtro + teclado + ARIA listbox. */
export function SlashMenu({
  query,
  onSelect,
  onClose,
}: {
  query: string;
  onSelect: (item: MenuItem) => void;
  onClose: () => void;
}) {
  const catalog = useChatStore((s) => s.skillCatalog);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => filterItems(catalog, query), [catalog, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Teclado global mientras el menú está abierto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const result = handleMenuKey(e.key, index, items.length);
      if (result.action === 'none') return;
      e.preventDefault();
      if (result.action === 'move') setIndex(result.index);
      if (result.action === 'close') onClose();
      if (result.action === 'select' && items[result.index]) {
        onSelect(items[result.index]);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, items, onSelect, onClose]);

  // Scroll del activo a la vista
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (items.length === 0) {
    return (
      <div className="mb-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-muted-fg shadow-lg">
        Sin resultados para «{query}»
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Comandos y skills"
      className="mb-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg"
    >
      {items.map((item, i) => (
        <button
          key={`${item.kind}-${item.name}`}
          type="button"
          role="option"
          aria-selected={i === index}
          data-idx={i}
          onClick={() => onSelect(item)}
          className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 ${
            i === index ? 'bg-muted' : 'hover:bg-muted'
          }`}
        >
          <span className="flex w-full items-center gap-2">
            <span className="font-mono text-sm text-fg">/{item.name}</span>
            {item.builtin && (
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                comando
              </span>
            )}
          </span>
          <span className="line-clamp-1 text-xs text-muted-fg">{item.description}</span>
        </button>
      ))}
    </div>
  );
}

/** Ejecuta la selección: built-in directo o skill (lee SKILL.md y lo activa). */
export async function executeSelection(item: MenuItem): Promise<boolean> {
  const store = useChatStore.getState();
  if (item.kind === 'builtin') {
    switch (item.name) {
      case 'new':
        store.newChat();
        return true;
      case 'clear': {
        const activeId = store.activeChatId;
        useChatStore.setState((s) => ({
          chats: s.chats.map((c) =>
            c.id === activeId
              ? { ...c, messages: [], tokensUsed: undefined, updatedAt: Date.now() }
              : c,
          ),
        }));
        return true;
      }
      case 'theme': {
        const current = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = current;
        return true;
      }
      case 'agents':
        // Vista de agentes llega en Task 12; por ahora no-op
        return true;
      case 'model':
        return true; // el ChatInput abre el ModelPicker
      default:
        return false;
    }
  }
  // skill: lee el SKILL.md completo y lo activa como system prompt
  if (!item.dir) return false;
  try {
    const file = await invoke<SkillFile>('read_skill', { dir: item.dir });
    store.setSkill(file.dir, file.content);
    return true;
  } catch {
    return false;
  }
}
