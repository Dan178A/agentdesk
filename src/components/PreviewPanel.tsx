import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { save } from '@tauri-apps/plugin-dialog';
import { Code2, Globe, ImageIcon, Save, Square, Table2, FileText, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePreviewStore } from '../store/preview';
import { parseCsv } from '../lib/preview';

const KIND_ICON = {
  html: Globe,
  markdown: FileText,
  csv: Table2,
  image: ImageIcon,
  code: Code2,
} as const;

const EXT: Record<string, string> = {
  html: 'html',
  markdown: 'md',
  csv: 'csv',
  image: 'txt',
  code: 'txt',
} as const;

/** Panel lateral derecho con la vista previa del contenido producido (plan v2.0). */
export function PreviewPanel() {
  const open = usePreviewStore((s) => s.open);
  const content = usePreviewStore((s) => s.content);
  const close = usePreviewStore((s) => s.close);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  // Reset del «Guardado» al cambiar el contenido del panel
  useEffect(() => setSavedTo(null), [content]);

  if (!open || !content) return null;
  const Icon = KIND_ICON[content.kind];

  const saveAs = async () => {
    const ext = EXT[content.kind] ?? 'txt';
    const defaultName = `${content.title.replace(/[\\/:*?"<>|]/g, '_') || 'archivo'}.${ext}`;
    const path = await save({ defaultPath: defaultName });
    if (!path) return;
    await invoke('write_file', { input: { path, content: content.text } });
    setSavedTo(path);
  };

  return (
    <aside
      aria-label="Panel de vista previa"
      className="flex h-screen w-[42%] max-w-3xl min-w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon size={15} className="text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{content.title}</span>
        {content.kind === 'image' && (
          <a
            href={content.text}
            download="vista-previa"
            className="rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
            aria-label="Guardar imagen"
          >
            <Square size={13} aria-hidden />
          </a>
        )}
        {content.kind !== 'image' && (
          <button
            type="button"
            onClick={() => void saveAs()}
            aria-label="Guardar como archivo"
            className={
              savedTo
                ? 'flex max-w-48 items-center gap-1 truncate rounded-lg px-2 py-1 text-xs text-primary'
                : 'rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg'
            }
            title={savedTo ?? undefined}
          >
            {savedTo ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Save size={12} aria-hidden />
                {savedTo}
              </span>
            ) : (
              <Save size={14} aria-hidden />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar vista previa"
          className="rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
        >
          <X size={15} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <PreviewBody content={content} />
      </div>
    </aside>
  );
}

function PreviewBody({ content }: { content: NonNullable<ReturnType<typeof usePreviewStore.getState>['content']> }) {
  switch (content.kind) {
    case 'html':
      return (
        <iframe
          srcDoc={content.text}
          sandbox="allow-scripts"
          title={content.title}
          className="h-full w-full bg-white"
        />
      );
    case 'markdown':
      return (
        <div className="markdown px-5 py-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.text}</ReactMarkdown>
        </div>
      );
    case 'csv': {
      const rows = parseCsv(content.text);
      if (rows.length === 0) return <Empty />;
      const [head, ...body] = rows;
      return (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className="border-b border-border bg-muted px-3 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j} className="border-b border-border px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'image':
      return (
        <div className="flex h-full items-center justify-center p-4">
          <img src={content.text} alt={content.title} className="max-h-full max-w-full rounded-lg" />
        </div>
      );
    default:
      return <Empty />;
  }
}

function Empty() {
  return <p className="px-5 py-8 text-center text-sm text-muted-fg">Contenido vacío</p>;
}
