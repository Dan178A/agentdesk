import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import {
  Brain,
  Code2,
  Eye,
  Gauge,
  Globe,
  ImageIcon,
  Save,
  Square,
  Table2,
  FileText,
  X,
} from 'lucide-react';
import { usePreviewStore } from '../store/preview';
import { parseCsv } from '../lib/preview';
import { useMemoryStore } from '../store/memory';
import { useFactsStore } from '../store/facts';
import { useUsageStore } from '../store/usage';
import { summarizeUsage, formatTokens } from '../lib/usage';
import { UsageRing } from './UsageRing';

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

/** Panel lateral derecho: vista previa del contenido o estado de memoria/uso (v2.6). */
export function PreviewPanel() {
  const open = usePreviewStore((s) => s.open);
  const content = usePreviewStore((s) => s.content);
  const mode = usePreviewStore((s) => s.mode);
  const close = usePreviewStore((s) => s.close);
  const setStatusMode = usePreviewStore((s) => s.setStatusMode);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  // Reset del «Guardado» al cambiar el contenido del panel
  useEffect(() => setSavedTo(null), [content]);

  if (!open) return null;
  const effectiveMode = content ? mode : 'status';
  const Icon = content ? KIND_ICON[content.kind] : Brain;

  const saveAs = async () => {
    if (!content) return;
    const ext = EXT[content.kind] ?? 'txt';
    const defaultName = `${content.title.replace(/[\\/:*?"<>|]/g, '_') || 'archivo'}.${ext}`;
    const path = await save({ defaultPath: defaultName });
    if (!path) return;
    await invoke('write_file', { input: { path, content: content.text } });
    setSavedTo(path);
  };

  return (
    <aside
      aria-label="Panel de vista previa y estado"
      className="flex h-screen w-[42%] max-w-3xl min-w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon size={15} className="text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {effectiveMode === 'status' ? 'Memoria y uso' : content!.title}
        </span>
        {/* Modo: estado (memoria/uso) ↔ vista previa */}
        <button
          type="button"
          onClick={() => setStatusMode('status')}
          aria-label="Ver memoria y uso de tokens"
          aria-pressed={effectiveMode === 'status'}
          className={`rounded-lg p-1.5 transition-colors duration-200 hover:bg-muted ${
            effectiveMode === 'status' ? 'text-primary' : 'text-muted-fg'
          }`}
        >
          <Gauge size={14} aria-hidden />
        </button>
        {content && (
          <button
            type="button"
            onClick={() => setStatusMode('preview')}
            aria-label="Volver a la vista previa"
            aria-pressed={effectiveMode === 'preview'}
            className={`rounded-lg p-1.5 transition-colors duration-200 hover:bg-muted ${
              effectiveMode === 'preview' ? 'text-primary' : 'text-muted-fg'
            }`}
          >
            <Eye size={14} aria-hidden />
          </button>
        )}
        {content && content.kind === 'image' && (
          <a
            href={content.text}
            download="vista-previa"
            className="rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
            aria-label="Guardar imagen"
          >
            <Square size={13} aria-hidden />
          </a>
        )}
        {content && content.kind !== 'image' && (
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
        {effectiveMode === 'status' ? (
          <StatusBody />
        ) : (
          content && <PreviewBody content={content} />
        )}
      </div>
    </aside>
  );
}

/** Modo «Estado» (v2.6): memoria integrada, hechos guardados y uso de tokens. */
function StatusBody() {
  const memoryActive = useMemoryStore((s) => s.active);
  const memoryFiles = useMemoryStore((s) => s.files.length);
  const memoryPath = useMemoryStore((s) => s.path);
  const factsCount = useFactsStore((s) => s.facts.length);
  const events = useUsageStore((s) => s.events);
  const sessionStart = useUsageStore((s) => s.sessionStart);
  const sessionBudget = useUsageStore((s) => s.sessionBudget);
  const weekBudget = useUsageStore((s) => s.weekBudget);
  const s = summarizeUsage(events, { now: Date.now(), sessionStart, sessionBudget, weekBudget });

  return (
    <div className="space-y-4 px-4 py-4 text-sm">
      <section className="flex items-center justify-around rounded-xl border border-border bg-surface px-4 py-3">
        <UsageRing
          pct={s.sessionPct}
          label="Sesión"
          title={`Sesión: ${s.sessionTokens} de ${sessionBudget} tokens`}
          size={52}
        />
        <UsageRing
          pct={s.weekPct}
          label="Semana"
          title={`7 días: ${s.weekTokens} de ${weekBudget} tokens`}
          size={52}
        />
        <div className="text-center">
          <p className="text-lg font-semibold tabular-nums">{formatTokens(s.weekTokens)}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-fg">tokens / 7 días</p>
          {s.topModel && (
            <p className="mt-1 truncate text-xs text-muted-fg">
              top: <span className="text-fg">{s.topModel.model}</span>
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="flex items-center gap-2 font-medium">
          <Brain size={14} className="text-primary" aria-hidden />
          Memoria de fichas
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${memoryActive ? 'bg-primary text-primary-fg' : 'bg-muted text-muted-fg'}`}>
            {memoryActive ? 'activa' : 'desactivada'}
          </span>
        </p>
        <p className="mt-1.5 text-xs text-muted-fg">
          {memoryActive
            ? `${memoryFiles} fichas cargadas de ${memoryPath}`
            : `Sin activar — activa con /memoria para inyectar ${memoryPath === '' ? 'tu' : 'la'} carpeta de proyectos`}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="font-medium">Hechos guardados</p>
        <p className="mt-1.5 text-xs text-muted-fg">
          {factsCount === 0
            ? 'Aún no hay detalles guardados — se extraen automáticamente de tus conversaciones.'
            : `${factsCount} detalles relevantes que el sistema recuerda y recupera por tema.`}
        </p>
      </section>
    </div>
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
