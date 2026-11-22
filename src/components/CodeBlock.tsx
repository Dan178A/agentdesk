import { memo, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

/** Bloque de código con header de lenguaje y botón copiar. */
export const CodeBlock = memo(function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const lang = /language-([\w+#-]+)/.exec(className ?? '')?.[1];
  const code = extractText(children);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bloqueado: sin feedback
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-fg">
        <span>{lang ?? 'código'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar código"
          className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors duration-200 hover:bg-surface hover:text-fg"
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-sm leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
});
