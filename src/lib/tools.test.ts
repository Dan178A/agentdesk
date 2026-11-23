import { describe, expect, it } from 'vitest';
import { extractToolCalls, describeCall, needsConfirmation, AGENT_SYSTEM_PROMPT } from './tools';

const REPLY = `Voy a buscar:
\`\`\`tool
{"tool":"search_folder","args":{"path":"C:/DropAudio","query":"precio"}}
{"tool":"read_file","args":{"path":"C:/DropAudio/precios.md"}}
{json roto aquí}
{"tool":"hacker","args":{}}
\`\`\`
Y con eso respondo.`;

describe('extractToolCalls', () => {
  it('extrae solo llamadas válidas y tolera basura', () => {
    const calls = extractToolCalls(REPLY);
    expect(calls).toEqual([
      { tool: 'search_folder', args: { path: 'C:/DropAudio', query: 'precio' } },
      { tool: 'read_file', args: { path: 'C:/DropAudio/precios.md' } },
    ]);
  });

  it('sin bloque tool → vacío (respuesta final)', () => {
    expect(extractToolCalls('La respuesta final es 42.')).toEqual([]);
    expect(extractToolCalls('')).toEqual([]);
  });

  it('fence sin cerrar (streaming parcial) → vacío sin crash', () => {
    expect(extractToolCalls('start\n```tool\n{"tool":"read_file"}')).toEqual([]);
  });

  it('varios bloques tool en la misma respuesta', () => {
    const calls = extractToolCalls(
      '```tool\n{"tool":"read_file","args":{"path":"a"}}\n```\n```tool\n{"tool":"run_command","args":{"cmd":"dir"}}\n```',
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].tool).toBe('run_command');
  });
});

describe('gates y etiquetas', () => {
  it('run_command pide confirmación; el resto no', () => {
    expect(needsConfirmation({ tool: 'run_command', args: {} })).toBe(true);
    expect(needsConfirmation({ tool: 'read_file', args: {} })).toBe(false);
  });

  it('describeCall legible por herramienta', () => {
    expect(describeCall({ tool: 'search_folder', args: { query: 'kz', path: 'C:/x' } })).toBe(
      'search_folder "kz" en C:/x',
    );
    expect(describeCall({ tool: 'run_command', args: { cmd: 'dir' } })).toBe('dir');
  });

  it('el system prompt nombra las 4 herramientas', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('read_file');
    expect(AGENT_SYSTEM_PROMPT).toContain('read_folder');
    expect(AGENT_SYSTEM_PROMPT).toContain('search_folder');
    expect(AGENT_SYSTEM_PROMPT).toContain('run_command');
  });
});
