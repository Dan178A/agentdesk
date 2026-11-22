/** Skill crudo que devuelve list_skills (Rust). */
export interface SkillRaw {
  dir: string;
  content: string;
}

/** Skill completo leído por read_skill (Rust). */
export interface SkillFile {
  dir: string;
  content: string;
}

export interface SkillMeta {
  dir: string;
  name: string;
  description: string;
}

export interface MenuItem {
  name: string;
  description: string;
  kind: 'builtin' | 'skill';
  dir?: string;
  builtin?: boolean;
}

/** Comandos built-in (spec §7.2) — prioridad sobre skills homónimos. */
export const BUILTIN_CMDS: { name: string; description: string }[] = [
  { name: 'model', description: 'Cambiar el modelo del chat' },
  { name: 'agents', description: 'Ir a la vista de agentes' },
  { name: 'new', description: 'Crear un chat nuevo' },
  { name: 'clear', description: 'Vaciar los mensajes del chat actual' },
  { name: 'theme', description: 'Cambiar tema: claro, oscuro o sistema' },
];

function clean(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
      (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Parser del frontmatter YAML-subset de un SKILL.md (name + description con
 * block scalars >- > |- | y comillas). Tolerante: null si es inválido o está
 * cortado por el límite de 8 KiB (Review Focus 3).
 */
export function parseFrontmatter(raw: SkillRaw): SkillMeta | null {
  const content = raw.content.replace(/\r\n/g, '\n');
  if (!content.startsWith('---\n')) return null;
  const close = content.indexOf('\n---', 4);
  if (close === -1) return null;
  const lines = content.slice(4, close).split('\n');

  let name: string | undefined;
  let description = '';

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nameMatch = /^name:\s*(.*)$/.exec(line);
    if (nameMatch && name === undefined) {
      name = clean(nameMatch[1]);
      i++;
      continue;
    }
    const descMatch = /^description:\s*(.*)$/.exec(line);
    if (descMatch) {
      const value = descMatch[1].trim();
      const isFold = value === '>-' || value === '>';
      const isLiteral = value === '|-' || value === '|';
      if (isFold || isLiteral) {
        const parts: string[] = [];
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith('  ') || lines[j].startsWith('\t'))) {
          parts.push(lines[j].trim());
          j++;
        }
        description = parts.join(isFold ? ' ' : '\n');
        i = j;
        continue;
      }
      description = clean(value);
      i++;
      continue;
    }
    i++;
  }

  if (name === undefined && !description) return null;
  return { dir: raw.dir, name: name && name.length > 0 ? name : raw.dir, description };
}

/**
 * Catálogo del menú slash: built-ins primero, skills alfabéticos después.
 * Un skill con el nombre de un built-in queda fuera (spec §7.2.5).
 * Los raws adicionales se parsean aquí; los inválidos no entran.
 */
export function buildCatalog(metas: SkillMeta[], raws: SkillRaw[] = []): MenuItem[] {
  const extra = raws
    .map(parseFrontmatter)
    .filter((m): m is SkillMeta => m !== null);
  const all = [...metas, ...extra].sort((a, b) => a.name.localeCompare(b.name));
  const builtinNames = new Set(BUILTIN_CMDS.map((b) => b.name));

  const items: MenuItem[] = BUILTIN_CMDS.map((b) => ({
    ...b,
    kind: 'builtin' as const,
    builtin: true,
  }));
  for (const m of all) {
    if (builtinNames.has(m.name)) continue;
    items.push({
      name: m.name,
      description: m.description,
      kind: 'skill',
      dir: m.dir,
      builtin: false,
    });
  }
  return items;
}
