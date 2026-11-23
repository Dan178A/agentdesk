/** Memoria guardada (v2.6): hechos que el sistema extrae y recuerda por relevancia. */
export interface SavedFact {
  id: string;
  text: string;
  ts: number;
  /** Proyecto o 'general'. */
  scope: string;
  chatId: string;
}

export const FACTS_MAX = 500;

/** Parseo tolerante de la lista JSON que el modelo devuelve. */
export function parseFactsReply(raw: string): string[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const balanced = /\[[\s\S]*\]/.exec(raw);
  const candidate = (fenced ? fenced[1] : null) ?? (balanced ? balanced[0] : raw);
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length >= 10 && s.length <= 400)
      .slice(0, 3);
  } catch {
    return [];
  }
}

const STOP = new Set([
  'que', 'los', 'las', 'por', 'una', 'para', 'del', 'este', 'esta', 'con', 'como', 'cual',
  'cuales', 'cada', 'todo', 'todos', 'pero', 'mas', 'the', 'and', 'hay', 'sus', 'esta',
]);

/** Recall: hechos ordenados por coincidencia con la consulta (top N). */
export function recallFacts(facts: SavedFact[], query: string, limit = 5): SavedFact[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  const scored = facts.map((f) => {
    let score = 0;
    const hay = `${f.text} ${f.scope}`.toLowerCase();
    for (const t of tokens) {
      let idx = 0;
      let count = 0;
      while (count < 3) {
        idx = hay.indexOf(t, idx);
        if (idx === -1) break;
        score += 1;
        idx += t.length;
        count += 1;
      }
    }
    return { f, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.f.ts - a.f.ts)
    .slice(0, limit)
    .map((s) => s.f);
}

/** System prompt con los hechos relevantes de este mensaje. */
export function buildFactsSystem(matched: SavedFact[]): string {
  if (matched.length === 0) return '';
  return (
    'Memoria guardada de detalles relevantes anteriores (úsala para responder con continuidad):\n' +
    matched.map((f) => `- ${f.text}`).join('\n')
  );
}

export function dedupeFacts(existing: SavedFact[], incoming: string[], scope: string, chatId: string): SavedFact[] {
  const added: SavedFact[] = [];
  const seen = new Set(existing.map((f) => f.text.toLowerCase()));
  for (const text of incoming) {
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      ts: Date.now(),
      scope,
      chatId,
    });
  }
  const next = [...existing, ...added];
  return next.slice(-FACTS_MAX); // conserva los más recientes
}
