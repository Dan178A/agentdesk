import { describe, it, expect } from 'vitest';
import { parseModels, DEFAULT_ALIASES } from './models';
import type { ModelRaw } from './models';

// Fixture: los modelos reales del usuario (ollama list, 2026-11-22)
const FIXTURE: ModelRaw[] = [
  { id: 'deepseek-v4.1-flash:cloud', name: 'deepseek-v4.1-flash:cloud', capabilities: ['completion', 'thinking', 'tools', 'vision'] },
  { id: 'glm-5.3:cloud', name: 'glm-5.3:cloud', capabilities: ['completion', 'thinking', 'tools'] },
  { id: 'glm-5.3-flash:cloud', name: 'glm-5.3-flash:cloud', capabilities: ['completion', 'thinking', 'tools', 'vision'] },
  { id: 'gemma3:4b', name: 'gemma3:4b', capabilities: ['completion', 'vision'] },
  { id: 'nimble:latest', name: 'nimble:latest', capabilities: ['completion'] },
  { id: 'minimax-m2.5:cloud', name: 'minimax-m2.5:cloud', capabilities: ['completion', 'thinking', 'tools'] },
  { id: 'qwen3.6:latest', name: 'qwen3.6:latest', capabilities: ['completion', 'thinking'] },
  { id: 'gemma4:latest', name: 'gemma4:latest', capabilities: ['completion'] },
  { id: 'gemma4:e4b', name: 'gemma4:e4b', capabilities: ['completion'] },
];

describe('parseModels', () => {
  it('mapea los 3 alias default y los ordena primero', () => {
    const result = parseModels(FIXTURE, DEFAULT_ALIASES);
    expect(result.slice(0, 3).map((m) => m.alias)).toEqual(['glm', 'glm-max', 'deepseek']);
    expect(result[0].id).toBe('glm-5.3-flash:cloud');
    expect(result[1].id).toBe('glm-5.3:cloud');
    expect(result[2].id).toBe('deepseek-v4.1-flash:cloud');
  });

  it('el resto queda alfabético y sin alias', () => {
    const result = parseModels(FIXTURE, DEFAULT_ALIASES);
    const rest = result.slice(3).map((m) => m.id);
    expect(rest).toEqual([...rest].sort());
    expect(result.slice(3).every((m) => m.alias === undefined)).toBe(true);
  });

  it('sin aliases, nadie lleva alias y todo queda alfabético', () => {
    const result = parseModels(FIXTURE, {});
    expect(result.every((m) => m.alias === undefined)).toBe(true);
    expect(result.map((m) => m.id)).toEqual([...result.map((m) => m.id)].sort());
  });

  it('canThink es true solo para modelos con capability thinking', () => {
    const result = parseModels(FIXTURE, DEFAULT_ALIASES);
    const glmFlash = result.find((m) => m.id === 'glm-5.3-flash:cloud')!;
    const gemma3 = result.find((m) => m.id === 'gemma3:4b')!;
    expect(glmFlash.canThink).toBe(true);
    expect(gemma3.canThink).toBe(false);
  });

  it('un alias sin modelo correspondiente no aparece', () => {
    const result = parseModels(FIXTURE, { 'inventado': 'no-existe:latest' });
    expect(result.find((m) => m.alias === 'inventado')).toBeUndefined();
  });
});
