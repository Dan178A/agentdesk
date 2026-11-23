import { invoke } from '@tauri-apps/api/core';
import type { FileRead } from './fsFiles';

/** Protocolo del modo agente (v2.7): bloques ```tool con una llamada JSON por línea. */
export interface ToolCall {
  tool: 'read_file' | 'read_folder' | 'search_folder' | 'run_command';
  args: Record<string, string>;
}

export interface ToolResult {
  call: ToolCall;
  ok: boolean;
  output: string;
}

/** Línea que puede pedir confirmación al usuario antes de ejecutarse. */
export function needsConfirmation(call: ToolCall): boolean {
  return call.tool === 'run_command';
}

/** Extrae las llamadas ```tool de una respuesta del modelo. */
export function extractToolCalls(reply: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of reply.matchAll(/```tool\n([\s\S]*?)```/g)) {
    for (const line of match[1].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as { tool?: string; args?: Record<string, string> };
        if (
          typeof parsed.tool === 'string' &&
          ['read_file', 'read_folder', 'search_folder', 'run_command'].includes(parsed.tool)
        ) {
          calls.push({ tool: parsed.tool as ToolCall['tool'], args: parsed.args ?? {} });
        }
      } catch {
        // línea no-JSON: se ignora (protocolo tolerante)
      }
    }
  }
  return calls;
}

export const AGENT_SYSTEM_PROMPT =
  'Estás en MODO AGENTE con herramientas sobre esta máquina. Antes de responder puedes investigar: ' +
  'cuando necesites información, responde SOLO con un bloque de código ```tool con UNA llamada por línea: ' +
  '{"tool":"<nombre>","args":{...}}. Herramientas: ' +
  'read_file {"path"} · read_folder {"path"} · search_folder {"path","query"} · run_command {"cmd"} ' +
  '(read_folder solo lista archivos de texto; search_folder busca contenido). ' +
  'Cuando tengas lo necesario, responde la pregunta final en español SIN bloque tool. No inventes contenido de archivos: verifícalo con las herramientas.';

/** Ejecuta una llamada (los comandos ya pasaron el gate de confirmación del store). */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case 'read_file': {
        const f = await invoke<FileRead>('read_file', { path: call.args.path ?? '' });
        return { call, ok: true, output: `— archivo: ${f.name} —\n${f.content}` };
      }
      case 'read_folder': {
        const files = await invoke<FileRead[]>('read_dir_files', { path: call.args.path ?? '' });
        return {
          call,
          ok: true,
          output:
            `${files.length} archivos:\n${files.map((f) => `- ${f.name} (${f.sizeBytes} B)`).join('\n') || '(vacía)'}`,
        };
      }
      case 'search_folder': {
        const matches = await invoke<
          { file: string; line: number; content: string }[]
        >('search_files', { path: call.args.path ?? '', query: call.args.query ?? '' });
        return {
          call,
          ok: true,
          output:
            matches.length === 0
              ? 'Sin coincidencias.'
              : matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n'),
        };
      }
      case 'run_command': {
        const out = await invoke<string>('run_command', { cmd: call.args.cmd ?? '' });
        return { call, ok: true, output: out };
      }
      default:
        return { call, ok: false, output: 'Herramienta desconocida' };
    }
  } catch (e) {
    return { call, ok: false, output: String(e).replace(/^Error:\s*/, '') };
  }
}

/** Etiqueta legible de la llamada, para las tarjetas y el terminal. */
export function describeCall(call: ToolCall): string {
  switch (call.tool) {
    case 'read_file':
      return `read_file ${call.args.path ?? ''}`;
    case 'read_folder':
      return `read_folder ${call.args.path ?? ''}`;
    case 'search_folder':
      return `search_folder "${call.args.query ?? ''}" en ${call.args.path ?? ''}`;
    case 'run_command':
      return call.args.cmd ?? 'run_command';
  }
}
