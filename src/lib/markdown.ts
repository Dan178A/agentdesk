export interface CodeBlock {
  lang: string | undefined;
  code: string;
}

const FENCE = /```([\w+#-]*)\n?([\s\S]*?)```/g;

/** Bloques de código de un markdown (para tests y utilidades). */
export function splitCodeBlocks(md: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  for (const m of md.matchAll(FENCE)) {
    out.push({ lang: m[1] ? m[1] : undefined, code: m[2] });
  }
  return out;
}
