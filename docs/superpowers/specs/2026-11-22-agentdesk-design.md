# AgentDesk — Spec de Diseño

**Fecha:** 2026-11-22
**Estado:** Aprobado en sesión de diseño (brainstorming architectural path)
**Stack:** Tauri 2 + React 18 + TypeScript + Vite + Tailwind CSS

---

## 1. Visión y objetivos

AgentDesk es una aplicación de escritorio para Windows (estilo Claude Desktop) que funciona como
wrapper de chat contra un servidor Ollama local (`http://localhost:11434`). Permite conversar con
modelos LLM con razonamiento visible, cargar skills mediante un menú `/` (como Claude Code), lanzar
equipos de agentes en paralelo (con orquestador automático) y generar código con resaltado de
sintaxis.

**Para quién:** el propio usuario (desarrollador JS/TS/Python), en su máquina Windows 11 con
Ollama 0.40.17 y modelos cloud (glm-5.3, glm-5.3-flash, deepseek-v4.1-flash) y locales (qwen3.6,
gemma4, minimax-m2.5, gemma3, nimble).

**Criterios de éxito:**
1. Chat con streaming en tiempo real y **pensamiento del modelo visible** en panel colapsable,
   separado del contenido de la respuesta (`message.thinking` vs `message.content` de Ollama).
2. Menú `/` que carga cualquier skill con `SKILL.md` desde `~/.claude/skills/` (≈110 disponibles),
   con filtro y navegación por teclado.
3. Multiagentes: modo manual (broadcast paralelo) y modo orquestador (líder divide la meta en
   subtareas, sintetiza resultados).
4. Código en respuestas con syntax highlighting y botón de copiar.
5. Estética Claude: cálida (crema/coral), minimalista, con dark mode completo y accesibilidad.

## 2. Requisitos funcionales

| ID | Requisito |
|----|-----------|
| RF-1 | Chat multi-turno con streaming de tokens |
| RF-2 | Panel de pensamiento por mensaje del asistente: colapsable, animado mientras genera, muestra duración |
| RF-3 | Selector de modelo con alias cortos arriba (`glm`, `glm-max`, `deepseek`) + resto de modelos de `/api/tags` por nombre completo |
| RF-4 | Menú `/`: popup con filtro en vivo, ↑↓/Enter/Esc; inyecta el SKILL.md elegido como system prompt del chat; badge sobre el input con opción de quitar |
| RF-5 | Comandos built-in: `/model`, `/agents`, `/new`, `/clear`, `/theme` (prioridad sobre skills homónimos) |
| RF-6 | Multiagente manual: enviar un mensaje a N agentes en paralelo, resultados en grid con thinking individual |
| RF-7 | Multiagente orquestado: agente líder divide la meta en subtareas (JSON), despacho paralelo, síntesis final |
| RF-8 | Editor de equipo de agentes: nombre, modelo, skill opcional, prompt de rol |
| RF-9 | Render markdown completo: encabezados, listas, tablas, código con highlight + copiar |
| RF-10 | Historial de chats con sidebar, renombrar/eliminar chat, persistencia JSON automática |
| RF-11 | Persistencia de equipos de agentes y settings (alias, modelo default, tema) |
| RF-12 | Stop: abortar la generación en curso |
| RF-13 | Dark/light mode (default: sigue al sistema) |
| RF-14 | Detección de Ollama caído con banner instructivo + reintentar |

## 3. No-objetivos (v1)

- No hay tool-use/ejecución de herramientas por los modelos (solo texto).
- No hay truncado automático de contexto largo (solo aviso visual).
- No hay gestión de archivos adjuntos/imágenes (aunque modelos con vision existen, v1 es texto).
- No hay empaquetado/distribución (instalador .msi) — se ejecuta con `npm run tauri dev` o build local.
- No hay edición de skills desde la app (read-only de `~/.claude/skills`).

## 4. Arquitectura

**Principio:** Rust es una capa fina y estable (ventana, HTTP, filesystem); toda la lógica de
producto vive en TypeScript, el stack dominante del usuario. El contrato IPC se define una vez y
el resto del desarrollo es solo frontend.

```
┌───────────────────────── Tauri 2 (Rust) ─────────────────────────┐
│ main.rs   → ventana, registro de comandos                        │
│ ollama.rs → POST /api/chat (stream, think:true) → Channel chunks │
│ fs.rs     → listar/leer skills; leer/guardar historial/settings │
└──────────────────────────────────────────────────────────────────┘
          invoke('...')              Channel<Chunk>
┌─────────────────────── React 18 + TS (frontend) ─────────────────┐
│ store.ts (zustand): chats, agentes, settings, skills            │
│ lib/ollama.ts · lib/skills.ts · lib/orchestrator.ts · markdown  │
│ components/: Sidebar, ChatView, ThinkingPanel, SlashMenu,       │
│   ModelPicker, AgentGrid, MessageBubble, CodeBlock, ErrorBanner │
└──────────────────────────────────────────────────────────────────┘
```

### Estructura de archivos

```
agentdesk/
├── src-tauri/
│   ├── src/{main.rs, ollama.rs, fs.rs, lib.rs}
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/default.json
├── src/
│   ├── components/
│   ├── lib/
│   ├── App.tsx
│   ├── store.ts
│   ├── main.tsx
│   ├── index.css        (tokens + Tailwind)
│   └── vite-env.d.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── docs/superpowers/specs/2026-11-22-agentdesk-design.md   (este documento)
```

## 5. Contrato IPC (fuente de verdad)

### Comandos (TS → Rust)

| Comando | Parámetros | Retorna | Notas |
|---|---|---|---|
| `list_models` | — | `ModelRaw[] {id, name, capabilities[]}` | Consulta `GET /api/tags` y devuelve los modelos crudos; el TS aplica los alias de settings y ordena (alias primero) |
| `list_skills` | — | `SkillRaw[] {dir, content}` | Escanea `~/.claude/skills/*/SKILL.md` y devuelve los primeros 8 KiB de cada uno; el TS parsea el frontmatter (`lib/skills.ts`, testeado) e ignora los inválidos |
| `read_skill` | `dir: string` | `{dir, name, description, content}` | Lee el SKILL.md completo. Valida que `dir` sea un hijo directo de `~/.claude/skills` (sin `..` ni rutas absolutas); name/description los aporta el TS del content |
| `chat_start` | `{id, model, messages, think}` | `void` (async) | Los chunks llegan por el Channel registrado; `id` identifica la sesión de chat para el routing |
| `chat_stop` | `id: string` | `void` | Aborta el request en curso (guard + cancel) |
| `history_list` / `history_save` / `history_delete` | — | — | JSON en `appDataDir/history.json` |
| `settings_load` / `settings_save` | — | — | JSON en `appDataDir/settings.json` |
| `app_dir` | — | `string` | Ruta de datos de la app (para mostrarla en settings) |

### Eventos del Channel (Rust → TS, por cada `chat_start`)

```ts
type StreamChunk =
  | { type: 'thinking'; id: string; delta: string }
  | { type: 'content';  id: string; delta: string }
  | { type: 'done';     id: string; thinkingMs: number }
  | { type: 'error';    id: string; message: string };
```

- Un `chat_start` corresponde a una generación (un "turno" de un chat o de un agente); `id` es
  un UUID por generación.
- `chat_stop(id)` cierra el channel y cancela el reqwest.

### Mapeo de alias (configurable en settings, defaults)

| Alias | Modelo real |
|---|---|
| `glm` | `glm-5.3-flash:cloud` |
| `glm-max` | `glm-5.3:cloud` |
| `deepseek` | `deepseek-v4.1-flash:cloud` |

## 6. Modelo de datos (TypeScript)

```ts
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;        // razonamiento crudo
  thinkingMs?: number;      // duración del thinking
  model?: string;           // modelo que respondió
  skill?: string;           // dir del skill activo al crear el mensaje
  createdAt: number;
  error?: string;
}

interface Chat {
  id: string;
  title: string;            // autogenerado con el primer mensaje (primeras ~40 chars)
  model: string;            // modelo actual del chat
  skill?: string;           // skill activo
  messages: ChatMessage[];
  createdAt: number; updatedAt: number;
}

interface Agent {
  id: string; name: string; model: string;
  skill?: string; rolePrompt: string;
}

interface Team {           // equipo de agentes
  id: string; name: string; agents: Agent[];
  orchestratorModel: string;  // default: 'glm-5.3:cloud' (glm-max)
}

interface Settings {
  aliases: Record<string, string>;   // alias → modelo real
  defaultModel: string;
  theme: 'system' | 'light' | 'dark';
  ollamaUrl: string;                 // default http://localhost:11434
}
```

## 7. Flujos detallados

### 7.1 Envío de un mensaje de chat

1. `store` agrega el mensaje del usuario al chat activo.
2. `lib/ollama.ts` construye `messages`: system prompt (skill activo si hay) + historial.
   El parámetro `think` se envía `true` solo si `model.capabilities` incluye `'thinking'`
   (gemma3 p. ej. no razona; para esos modelos no se pide thinking y el panel no se muestra).
3. `invoke('chat_start', {id, model, messages, think: true})` con un `Channel` nuevo.
4. Cada chunk `thinking` actualiza `ThinkingPanel` (abierto mientras genera); `content` el cuerpo.
5. `done` → congela el panel (colapsado por defecto al terminar, muestra duración), guarda en historial (debounced).
6. `error` → mensaje de error visible en el chat, el resto del chat queda intacto.

### 7.2 Menú slash `/`

1. En el input, `/` como primer carácter (o tras espacio) abre el popup.
2. Contenido: built-ins primero (5), luego skills (`list_skills`) filtrados por substring
   case-insensitive sobre nombre y descripción; el filtro se recalcula con cada tecla.
3. Teclado: ↑↓ mueve, Enter selecciona, Esc cierra, click también selecciona.
4. Seleccionar un **built-in**: ejecuta la acción. Seleccionar un **skill**: `read_skill(dir)`,
   badge con el nombre sobre el input y el contenido queda listo como system prompt.
5. Skills con el mismo nombre que un built-in: el built-in gana (built-ins listados primero).

### 7.3 Multiagente manual

1. Vista "Agentes": grid de tarjetas (una por agente del equipo activo).
2. Input de broadcast → un `chat_start` por agente en paralelo (mismo id de equipo, ids de
   generación distintos).
3. Cada tarjeta renderiza su propio ThinkingPanel + respuesta y estado (pendiente/generando/
   listo/error). Botón copiar por tarjeta.

### 7.4 Multiagente orquestado

1. Input de meta → prompt al líder: system prompt de orquestador + meta + descripción del
   equipo (nombre, modelo, rol de cada agente) + instrucción de responder SOLO un bloque
   ```json con `{"tareas":[{"agente":"<nombre>","prompt":"<subtarea>"}]}`.
2. Parser (`lib/orchestrator.ts`): extrae el primer bloque ```json (o el primer objeto {…}
   balanceado), valida schema, comprueba que cada `agente` exista en el equipo.
3. Si el JSON es inválido o referencia agentes inexistentes: 1 reintento con un mensaje de
   corrección adjuntando el error. Si falla de nuevo: error visible con el texto crudo del
   líder para que el usuario reparta manualmente.
4. Despacho paralelo de subtareas (flujo 7.3) con progreso visible.
5. Al terminar todas: síntesis — nuevo request al líder con las respuestas de cada agente +
   la meta original → respuesta final destacada (tarjeta "Síntesis").
6. El thinking del líder es visible en su propia tarjeta durante pasos 1 y 5.

## 8. Dirección visual

Fuente: ui-ux-pro-max `--design-system` (Minimalism & Swiss, motion sutil, densidad estándar)
con paleta adaptada a la estética Claude solicitada. Tokens de 3 capas (design-system skill):
primitive → semantic → component; componentes solo referencian tokens semánticos.

### Tokens (semantic → valores light/dark)

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FAF9F5` | `#1F1E1D` |
| `--surface` | `#FFFFFF` | `#262624` |
| `--fg` | `#1F1E1D` | `#F0EEE6` |
| `--muted` | `#F0EEE6` | `#2F2F2C` |
| `--muted-fg` | `#6B6A65` | `#A8A79E` |
| `--primary` | `#D97757` | `#D97757` |
| `--primary-fg` | `#FFFFFF` | `#1F1E1D` |
| `--border` | `#E5E1D8` | `#3D3D3A` |
| `--error` | `#DC2626` | `#F87171` |
| `--ring` | `#D97757` | `#D97757` |

Tipografía: Inter (UI, 400/500/600/700), mono del sistema para código. Base 16px, line-height 1.5+.
Idioma de la interfaz: español (todo el microcopy, labels y estados en español).

### Layout

- **Sidebar izquierda** (colapsable): botón "Nuevo chat", lista de chats (título + fecha),
  switch de vista Chats/Agentes, theme toggle, settings.
- **Área central**: mensajes (max-width ~48rem centrada); input fijo abajo con: textarea
  autoexpandible, selector de modelo integrado, badge de skill activo, botón enviar/stop.
- **Vista Agentes**: editor de equipo (tarjetas de agente) arriba, input de meta/broadcast,
  grid de resultados.
- **ThinkingPanel**: borde izquierdo 2px coral, fondo muted suave, header con
  "Pensamiento del modelo · Ns", colapsable con animación de altura respetando
  `prefers-reduced-motion`; shimmer en texto mientras genera.

### Reglas de accesibilidad (checklist pre-entrega)

- Contraste texto ≥ 4.5:1 en ambos temas (pares validados: fg/bg, muted-fg/surface).
- Focus ring visible (`--ring`) en todos los interactivos; navegación completa por teclado
  (el popup `/` es un listbox con `role="listbox"`/`option` y `aria-activedescendant`).
- Iconos SVG de Lucide con `aria-hidden` + `aria-label` en botones icon-only.
- Transiciones 150–250ms; `prefers-reduced-motion` desactiva shimmer/animaciones de altura.
- Botones ≥ 32px (desktop con mouse; no hay touch).

## 9. Errores y casos límite

| Caso | Comportamiento |
|---|---|
| Ollama caído (al iniciar o `list_models` falla) | ErrorBanner global: "Ollama no responde en <url> — arráncalo con `ollama serve`" + botón Reintentar |
| Modelo cloud sin internet | El chunk `error` llega al chat: mensaje claro con el nombre del modelo |
| JSON del líder inválido | 1 reintento con corrección; luego error con el texto crudo para reparto manual |
| Agente falla en paralelo | Su tarjeta marca error; los demás continúan; la síntesis procede con los exitosos |
| Stream cancelado (Stop) | El mensaje queda con lo generado + etiqueta "detenido por el usuario" |
| Skill sin frontmatter válido | No aparece en el listado (el escaneo lo omite y loguea en consola) |
| Contexto muy largo | Aviso visual discreto sobre el input; sin truncado en v1 |

## 10. Testing

- **Vitest (unit, TS):**
  - `lib/skills.ts`: parse de frontmatter (con name/description, sin YAML completo, con YAML raro).
  - `src-tauri/src/ollama.rs` (cargo test): parser NDJSON — chunks
    thinking/content/done/error y líneas partidas entre lecturas del socket.
  - `lib/ollama.ts` (store): transición de estados ante chunks (generando →
    done/error/stop; error no deja el chat colgado en "generando").
  - `lib/orchestrator.ts`: JSON válido → tareas; ```json con ruido; JSON malformado → retry;
    agente inexistente → retry → error con texto crudo.
  - `lib/markdown.ts`: código con lenguaje, sin lenguaje; copiar emite el texto correcto.
- **Integración manual (E2E con modelos reales):** checklist de la checklist pre-entrega +
  flujos 7.1–7.4 con `npm run tauri dev`.
- Los tests unitarios NO llaman a Ollama (se mockean los invoke/Channel de Tauri).

## 11. Dependencias

**npm:** react, react-dom, zustand, react-markdown, remark-gfm, rehype-highlight, lucide-react,
@tauri-apps/api, @tauri-apps/plugin-opener; dev: vite, @vitejs/plugin-react, typescript,
tailwindcss (@tailwindcss/vite), vitest. (Sin @testing-library/react en v1: los tests son de libs puras, no de componentes; se
agrega si más adelante se testean componentes.)

**crates (Rust):** tauri 2 (con features necesarias), tauri-plugin-opener, reqwest (json,
stream), tokio, serde/serde_json, uuid, dirs (home). MSVC toolchain ya presente en la máquina.

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rust 1.80.1 no cumple MSRV de algún crate de Tauri 2 reciente | `rustup update` (1 comando); verificar al iniciar el milestone 1 |
| Overhead de eventos IPC por token | Channel API de Tauri 2 (no events globales) + batching: el Rust agrupa chunks cada ~16ms |
| Render lento con mensajes largos | React memo por mensaje; el markdown se re-renderiza solo el mensaje en streaming |
| Razonamiento enorme (thinking de 10k tokens) | ThinkingPanel virtualiza/limita el render activo; colapsado corta el trabajo de layout |

## 13. Milestones de implementación (el plan detallado los desglosa)

1. **M1 — Esqueleto:** proyecto Tauri 2 + Vite + React + Tailwind con tokens, ventana abre, IPC `list_models` + ping Ollama, selector de modelo mock.
2. **M2 — Chat:** `chat_start` streaming con Channel, ThinkingPanel, markdown + código, Stop, ErrorBanner.
3. **M3 — Skills:** `list_skills`/`read_skill`, SlashMenu con built-ins, badge de skill, system prompt.
4. **M4 — Persistencia:** historial, sidebar de chats, settings.
5. **M5 — Multiagentes:** editor de equipo, broadcast manual, orquestador + síntesis.
6. **M6 — Pulido:** dark mode completo, accesibilidad, tests unitarios, checklist pre-entrega.

---

*Aprobado en conversación el 2026-11-22. Este documento es la fuente de verdad del diseño; los
cambios requieren actualizar este spec.*
