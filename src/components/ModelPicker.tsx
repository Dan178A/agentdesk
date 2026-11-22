import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ModelUI } from '../lib/models';

interface Props {
  models: ModelUI[];
  selected: string;
  onSelect: (id: string) => void;
}

/** Dropdown accesible de modelos (alias primero). */
export function ModelPicker({ models, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = models.find((m) => m.id === selected);
  const label = current?.alias ?? current?.id ?? selected;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Cambiar modelo"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
      >
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Modelos"
          className="absolute bottom-full z-10 mb-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lg"
        >
          {models.map((m) => (
            <li key={m.id} role="option" aria-selected={m.id === selected}>
              <button
                type="button"
                onClick={() => {
                  onSelect(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted ${
                  m.id === selected ? 'text-fg' : 'text-muted-fg hover:text-fg'
                }`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {m.alias ?? m.id}
                    {m.alias && (
                      <span className="ml-1.5 text-xs text-muted-fg font-normal">{m.id}</span>
                    )}
                  </span>
                </span>
                <Check
                  size={14}
                  aria-hidden
                  className={m.id === selected ? 'text-primary' : 'invisible'}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
