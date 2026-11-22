/** Modelo crudo que devuelve el comando list_models (desde GET /api/tags de Ollama). */
export interface ModelRaw {
  id: string;
  name: string;
  capabilities: string[];
}

/** Modelo listo para UI, con alias y capability de thinking resuelta. */
export interface ModelUI {
  id: string;
  name: string;
  alias?: string;
  canThink: boolean;
}

/** Alias default del spec §5 (configurables en settings). Orden de inserción = orden en el selector. */
export const DEFAULT_ALIASES: Record<string, string> = {
  'glm': 'glm-5.3-flash:cloud',
  'glm-max': 'glm-5.3:cloud',
  'deepseek': 'deepseek-v4.1-flash:cloud',
};

/** Aplica aliases y ordena: alias primero (orden de inserción), resto alfabético. */
export function parseModels(raw: ModelRaw[], aliases: Record<string, string>): ModelUI[] {
  const aliased: ModelUI[] = [];
  const usedIds = new Set<string>();

  for (const [alias, id] of Object.entries(aliases)) {
    const model = raw.find((m) => m.id === id);
    if (model) {
      aliased.push({
        id: model.id,
        name: model.name,
        alias,
        canThink: canThink(model),
      });
      usedIds.add(model.id);
    }
  }

  const rest: ModelUI[] = raw
    .filter((m) => !usedIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, canThink: canThink(m) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return [...aliased, ...rest];
}

/** true si el modelo soporta razonamiento separado (spec §7.1: think solo si incluye 'thinking'). */
export function canThink(model: Pick<ModelRaw, 'capabilities'>): boolean {
  return model.capabilities.includes('thinking');
}
