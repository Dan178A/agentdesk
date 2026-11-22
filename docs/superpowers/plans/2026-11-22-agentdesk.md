# AgentDesk — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App de escritorio (Tauri 2) tipo Claude Desktop que chatea con Ollama con thinking visible, menú `/` de skills, multiagentes con orquestador y estética Claude cálida.

**Architecture:** Rust es una capa fina (ventana + proxy HTTP streaming + filesystem); toda la lógica de producto vive en TypeScript/React con zustand. El contrato IPC (10 comandos + Channel de chunks) se define en los Tasks 1-9 y el resto es frontend.

**Tech Stack:** Tauri 2 (reqwest, tokio, serde), React 18, TypeScript, Vite, Tailwind CSS v4 (@tailwindcss/vite), zustand, react-markdown + rehype-highlight, @fontsource/inter, lucide-react, Vitest, cargo test.

**Spec:** `docs/superpowers/specs/2026-11-22-agentdesk-design.md` — el plan argumenta desde el spec; leer ambos antes de empezar.

## Global Constraints

- Ollama URL default `http://localhost:11434` (configurable en settings).
- Alias default: `glm` → `glm-5.3-flash:cloud`, `glm-max` → `glm-5.3:cloud`, `deepseek` → `deepseek-v4.1-flash:cloud`.
- `think: true` solo si el modelo tiene `'thinking'` en capabilities.
- Skills: read-only de `~/.claude/skills`; `read_skill` valida hijo directo (sin `..` ni absoluto).
- Tokens del spec §8 exactos: light `--bg #FAF9F5`, `--surface #FFFFFF`, `--fg #1F1E1D`, `--muted #F0EEE6`, `--muted-fg #6B6A65`, `--primary #D97757`, `--primary-fg #FFFFFF`, `--border #E5E1D8`; dark `--bg #1F1E1D`, `--surface #262624`, `--fg #F0EEE6`, `--muted #2F2F2C`, `--muted-fg #A8A79E`, `--primary #D97757`, `--primary-fg #1F1E1D`, `--border #3D3D3A`; error `#DC2626`/`#F87171`, ring `#D97757`.
- Contraste texto ≥ 4.5:1 en ambos temas; focus ring visible; `prefers-reduced-motion` desactiva shimmer/height-animations; iconos Lucide SVG con `aria-hidden` + labels; transiciones 150–250ms.
- Idioma de la UI: español (todo el microcopy).
- Commit tras cada task (feat:/fix: conventional, español o inglés consistente).
- Tests TS: Vitest con mocks de `@tauri-apps/api` (NUNCA llamar a Ollama real en tests). Tests Rust: `cargo test` con fixtures embebidos.

## Review Focus

Inputs que el spec implica pero ningún test de tarea ejercita — el más probable primero. Cada línea tiene su test en la tarea dueña del código:

1. **Stream que muere a mitad** (caída de red tras contenido parcial): el chat NO queda en estado "generando" para siempre y conserva lo generado → test en Task 7 (`error` tras `content` → estado error + contenido parcial visible).
2. **Doble envío** (Enter/Click mientras genera): no se lanza una segunda generación paralela → test en Task 7 (guard `isGenerating`).
3. **Frontmatter YAML variado** (description `>-` multilínea, con comillas, sin `name`): el parser no revienta ni esconde el skill → tests en Task 10.
4. **Líneas NDJSON partidas entre lecturas del socket** (un `\n` llega en dos reads): el parser Rust debe acumular buffer hasta línea completa → test en Task 6.
5. **Nombre de agente casi igual** (el líder devuelve "Analista Senior" y el equipo tiene "analista-senior"): matching por trim + case-insensitive para no desperdiciar el retry → test en Task 16.

---

### Task 1: Esqueleto del proyecto (Tauri 2 + Vite + React + TS + Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/smoke.test.ts`, `.gitignore`, `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nada (primer task).
- Produces: app que compila (`npm run build`, `cargo check`), Vitest corriendo, `npm run tauri dev` abre la ventana. Tauri identifier `com.danpc.agentdesk`, producto "AgentDesk", ventana 1280×800 min 900×600. Cargo package name `agentdesk`, `[lib] name = "agentdesk_lib"`, crate-type `["staticlib", "cdylib", "rlib"]`.

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "agentdesk", "private": true, "version": "0.1.0", "type": "module",
  "scripts": { "dev": "vite", "build": "tsc && vite build", "preview": "vite preview",
               "test": "vitest run", "tauri": "tauri" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1", "zustand": "^5.0.2" },
  "devDependencies": { "typescript": "^5.6.3", "vite": "^6.0.3", "@vitejs/plugin-react": "^4.3.4",
    "@tauri-apps/cli": "^2", "@tauri-apps/api": "^2", "vitest": "^2.1.8",
    "@tailwindcss/vite": "^4.0.0", "tailwindcss": "^4.0.0" }
}
```

Resto de dependencias se añaden en sus tasks dueños. `vite.config.ts`: plugins react + tailwindcss, `test: { environment: 'node' }`. `tsconfig.json`: `strict: true`, jsx react-jsx, moduleResolution bundler, include `src`.

- [ ] **Step 2: `npm install`** — verificar exit 0. Si algún crate de Tauri exige Rust más nuevo: `rustup update` y reintentar (riesgo M1 del spec §12).

- [ ] **Step 3: Crear esqueleto Tauri**

`src-tauri/tauri.conf.json`: `{"build": {"beforeDevCommand": "npm run dev", "devUrl": "http://localhost:5173", "beforeBuildCommand": "npm run build", "frontendDist": "../dist"}, "productName": "AgentDesk", "identifier": "com.danpc.agentdesk", "app": {"windows": [{"title": "AgentDesk", "width": 1280, "height": 800, "minWidth": 900, "minHeight": 600}], "security": {"csp": null}}, "bundle": {"active": true, "targets": "all"}}`.
`main.rs`: `fn main() { agentdesk_lib::run() }`. `lib.rs`: `pub fn run() { tauri::Builder::default().run(tauri::generate_context!()).expect("error al correr agentdesk"); }` (sin entry point mobile). `Cargo.toml`: tauri 2, serde/serde_json; build-dependencies tauri-build 2. `capabilities/default.json`: `{"identifier": "default", "windows": ["main"]}` (sin permisos extra aún).

- [ ] **Step 4: `cargo check`** dentro de `src-tauri`** — Expected: exit 0.

- [ ] **Step 5: Smoke test Vitest**

```ts
// src/smoke.test.ts
import { describe, it, expect } from 'vitest';
describe('pipeline', () => { it('vitest corre', () => { expect(2 + 2).toBe(4); }); });
```

Run: `npm test` → Expected: 1 passed.

- [ ] **Step 6: Verificación manual de ventana**

Run: `npm run tauri dev` → Expected: abre ventana "AgentDesk" con el HTML de `index.html` (título "AgentDesk" + h1 placeholder). Cerrar y continuar.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: esqueleto Tauri 2 + React + Vitest"`

---

### Task 2: Tokens de diseño, tema y contraste WCAG

**Files:**
- Create: `src/index.css`, `src/lib/theme.ts`, `src/lib/theme.test.ts`, `src/lib/contrast.ts`, `src/lib/contrast.test.ts`
- Modify: `src/main.tsx` (import index.css), `src/App.tsx` (usa tokens mínimos)

**Interfaces:**
- Consumes: Task 1 (pipeline).
- Produces: `resolveTheme(setting: 'system'|'light'|'dark', prefersDark: boolean): 'light'|'dark'`; variables CSS del spec §8 en `:root` (light) y `[data-theme="dark"]`; clase utilitaria de tema aplicada a `<html>` por `applyTheme(theme: 'light'|'dark'): void` (setea `documentElement.dataset.theme`). `contrastRatio(hexA: string, hexB: string): number`.

- [ ] **Step 1: Test de resolveTheme + applyTheme**

Casos: `('system', true) → 'dark'`, `('system', false) → 'light'`, `('dark', false) → 'dark'`, `('light', true) → 'light'`. Mock mínimo de document (jsdom no está; testear `resolveTheme` pura y `applyTheme` con un stub `document.documentElement` falso).

Run: `npm test` → Expected: FAIL (no existe theme.ts).

- [ ] **Step 2: Implementar `theme.ts`** (switch puro + setter de dataset). Run: `npm test` → PASS.

- [ ] **Step 3: Test de contraste WCAG sobre los tokens del spec**

```ts
import { TOKENS } from './contrast'; // pares light/dark exactos del spec §8
describe('contraste WCAG', () => {
  it.each(TOKENS)('$name ($mode) ≥ 4.5', ({ fg, bg, min = 4.5, name, mode }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
```

Pares: fg/bg (light y dark), muted-fg/surface (ambos), primary/primary-fg (ambos). Run → Expected: FAIL si algún par del spec no llega a 4.5 — si falla, NO cambiar el token a mano: ajustar `--muted-fg` light a `#5F5E58` o dark a `#B3B2A9` (valores aprobados) y actualizar spec §8 en el mismo commit.

- [ ] **Step 4: Implementar `contrast.ts`** (luminancia relativa W3C: sRGB→linear + 0.2126/0.7152/0.0722, ratio `(L1+0.05)/(L2+0.05)`) y `src/index.css` con `@import "tailwindcss";` + `@theme` mapeando los tokens + `:root`/`[data-theme="dark"]` con los valores del spec.

- [ ] **Step 5: Run `npm test`** → PASS. Commit: `feat: tokens de diseño + tema + contraste WCAG`

---

### Task 3: `list_models` (Rust) + catálogo de modelos (TS)

**Files:**
- Create: `src-tauri/src/ollama.rs`, `src/lib/models.ts`, `src/lib/models.test.ts`
- Modify: `src-tauri/src/lib.rs` (registra `list_models`), `src/App.tsx` (muestra lista u error)

**Interfaces:**
- Consumes: Task 1.
- Produces (Rust): `#[tauri::command] async fn list_models(ollama_url: String) -> Result<Vec<ModelRaw>, String>` con `ModelRaw {id, name, capabilities: Vec<String>}` (serde renames: `id` = name del tag, `capabilities` del campo `capabilities`). Lee `GET {ollama_url}/api/tags`; error de red → `Err(mensaje_es)`.
- Produces (TS): `parseModels(raw: ModelRaw[], aliases: Record<string,string>): ModelUI[]` con `ModelUI {id, name, alias?}` — alias primero, resto alfabético; `buildAliasesDefault()` retornando el mapa de Global Constraints.

- [ ] **Step 1: Test TS de parseModels** (fixture: los 9 modelos reales de `ollama list` — glm-5.3:cloud, glm-5.3-flash:cloud, deepseek-v4.1-flash:cloud, gemma3:4b, nimble:latest, minimax-m2.5:cloud, qwen3.6:latest, gemma4:latest, gemma4:e4b): con alias default → los 3 alias aparecen primero en orden glm, glm-max, deepseek; el resto alfabético; sin alias ({}), nadie tiene alias. Run → FAIL.

- [ ] **Step 2: Implementar `models.ts`**. Run → PASS.

- [ ] **Step 3: Implementar `ollama.rs` con reqwest** (`reqwest = { version = "0.12", features = ["json"] }` en Cargo.toml; `#[derive(Serialize)] ModelRaw` con rename a la forma TS). Registrar comando en `lib.rs` con `.manage(())` innecesario: `ollama_url` llega por parámetro desde TS (settings lo persisten en Task 12).

- [ ] **Step 4: `cargo check` + test de error**: en `ollama.rs`, `#[cfg(test)]` con un servidor localhost inexistente → `list_models("http://127.0.0.1:1")` retorna `Err`. Run: `cargo test` → PASS.

- [ ] **Step 5: UI mínima**: App lista modelos (o "Ollama no responde…" con botón Reintentar). Manual: `npm run tauri dev` con Ollama arriba → lista visible; con Ollama detenido → mensaje de error. Commit: `feat: list_models + selector de modelos`

---

### Task 4: Streaming de chat en Rust (chat_start/chat_stop)

**Files:**
- Create: `src-tauri/src/chat.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml` (tokio, uuid, futures)

**Interfaces:**
- Consumes: Task 1.
- Produces (Rust): `#[tauri::command] async fn chat_start(id: String, ollama_url: String, model: String, messages: Vec<ChatMsg>, think: bool, on_chunk: tauri::ipc::Channel<Chunk>) -> Result<(), String>`; `#[tauri::command] fn chat_stop(id: String)`. `Chunk` (serde `#[serde(tag = "type")]`, campos en camelCase exactos del spec §5: `{type:"thinking"|"content"|"done"|"error", id, delta?, thinkingMs?, message?}`). NDJSON: POST `{ollama_url}/api/chat` body `{model, messages, think, stream:true}`; parse línea a línea; batching: envía chunks acumulados máximo cada 16ms (o al terminar el buffer). `chat_stop`: `Mutex<HashMap<String, CancellationToken>>` global — al cancelar, envía `done` y no más chunks.

- [ ] **Step 1: Test Rust del parser NDJSON con línea partida**

`#[cfg(test)]` en `chat.rs` con un `parse_ndjson(state: &mut LineBuf, bytes: &str, out: &mut Vec<ChunkLike>)`: fixture con `{"message":{"thinking":"hola"},"done":false}\n{"message":{"content":"4"},` (línea incompleta) → emite 1 chunk thinking y retiene la línea incompleta; siguiente input `""done":false}\n` → emite el content. Más fixture: línea completa de `done:true` con `total_duration`. Run: `cargo test` → Expected FAIL (función no existe).

- [ ] **Step 2: Implementar parser + buffer** → `cargo test` PASS.

- [ ] **Step 3: Test de chat_stop en guard**: insertar id en el registry, llamar stop, verificar que el token está cancelado. → PASS.

- [ ] **Step 4: Implementar `chat_start`** (reqwest `.bytes_stream()`, acumulación + parse + batching + Channel `send`); think:false → Ollama no envía thinking y el código lo ignora. Registrar ambos comandos.

- [ ] **Step 5: `cargo check` PASS + commit** `feat: streaming de chat con channel y stop`

---

### Task 5: Store de chat + flujo de generación (zustand)

**Files:**
- Create: `src/store/chat.ts`, `src/lib/ollama.ts`, `src/store/chat.test.ts`, `src/test/mock-ipc.ts`
- Modify: `src/lib/models.ts` (exporta canThink(model))

**Interfaces:**
- Consumes: Task 4 (Chunk TS-side: `type Chunk = {type:'thinking'|'content'|'done'|'error', id:string, delta?:string, thinkingMs?:number, message?:string}`).
- Produces: `useChatStore` zustand con: `chats: Chat[]`, `activeChatId`, `isGenerating`, `skillDir?`, acciones `newChat(model)`, `sendMessage(text, model, ollamaUrl)`, `stopActive()`, `handleChunk(chatId, chunk)`, `setSkill(dir: string, content: string)` (quien llama ya resolvió el SKILL.md vía `read_skill`; en este task el test pasa un content fixture — la integración real llega en Task 8) y `clearSkill(): void`, `buildMessages(chat): ChatMsg[]` (system con skill primero + historial sin system). Tipos del spec §6. `streamChat(params, onChunk)` en `lib/ollama.ts`: crea `new Channel<Chunk>()`, `invoke('chat_start', {.., onChunk: channel})`, retorna `{stop: () => invoke('chat_stop', {id})}`.

- [ ] **Step 1: `mock-ipc.ts`**: mock de `@tauri-apps/api/core` (vi.mock) — `invoke(cmd, args)` grabado, `Channel` con `onmessage` capturable. Base de todos los tests TS siguientes.

- [ ] **Step 2: Tests del store (TDD)**

Casos: (a) `sendMessage` agrega mensaje user, crea assistant placeholder, `isGenerating=true`; (b) chunk thinking → `assistant.thinking` acumula; (c) chunk content → `content` acumula; (d) chunk done → `thinkingMs` seteado, `isGenerating=false`; (e) **error tras content parcial** → `message.error` seteado, contenido parcial conservado, `isGenerating=false` (Review Focus 1); (f) `sendMessage` mientras `isGenerating` → no llama a `chat_start` de nuevo (Review Focus 2); (g) `stopActive` → invoke `chat_stop` llamado y mensaje marcado `"detenido por el usuario"`; (h) skill activo → `buildMessages` pone system con el content del skill antes del historial; (i) título auto = primeras ~40 chars del primer mensaje.

Run: `npm test` → FAIL. Implementar `store/chat.ts` + `lib/ollama.ts`. Run → PASS.

- [ ] **Step 3: Commit** `feat: store de chat con streaming, stop, skills y manejo de errores`

---

### Task 6: UI de chat (ChatView, ThinkingPanel, markdown, input)

**Files:**
- Create: `src/components/ChatView.tsx`, `MessageBubble.tsx`, `ThinkingPanel.tsx`, `ChatInput.tsx`, `ModelPicker.tsx`, `ErrorBanner.tsx`, `src/lib/markdown.ts`, `src/lib/markdown.test.ts`
- Modify: `src/App.tsx` (layout: sidebar placeholder + ChatView), `src/main.tsx` (Inter de @fontsource/inter)

**Interfaces:**
- Consumes: Task 5 (`useChatStore`), Task 3 (`parseModels`).
- Produces: componentes UI; `splitCodeBlocks(md: string): {lang: string|undefined, code: string}[]` (para tests), `extractBlockForCopy`. React-markdown con rehype-highlight.

- [ ] **Step 1: Test de markdown lib**: splitCodeBlocks con bloque ```python, bloque sin lenguaje, sin bloques, dos bloques. Run → FAIL → implementar (regex de fences, sin librería) → PASS.

- [ ] **Step 2: Componentes** siguiendo tokens (nada de hex crudo — solo var(--…)): MessageBubble (user: burbuja `--muted`; assistant: sin fondo con avatar Sparkles de lucide); ThinkingPanel (header "Pensamiento del modelo · Ns", borde izq 2px `--primary`, colapsable con animación de altura, shimmer `@keyframes` desactivado con `@media (prefers-reduced-motion: reduce)`); CodeBlock (highlight.js, botón copiar con `aria-label="Copiar código"`, feedback "¡Copiado!" 1.5s); ChatInput (textarea autoexpand, Enter envía / Shift+Enter nueva línea, botón enviar ↔ stop (Square icon) según isGenerating, disabled si vacío o generando); ModelPicker (dropdown con lista de Task 3, `aria-expanded`, cierra con Esc, marca seleccionado con check icon); ErrorBanner (banner rojo `--error` con texto y botón Reintentar).

- [ ] **Step 3: Verificación manual con modelo real**: `npm run tauri dev`, chat con `glm` → streaming visible, thinking animado, colapso al terminar, copiar funciona, stop funciona, markdown con código renderiza. Con Ollama detenido → banner.

- [ ] **Step 4: Commit** `feat: UI de chat con thinking panel, markdown y control de generación`

---

### Task 7: Skills en Rust (list_skills, read_skill)

**Files:**
- Create: `src-tauri/src/skills.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 1.
- Produces (Rust): `#[tauri::command] async fn list_skills() -> Vec<SkillRaw>` con `SkillRaw {dir: String, content: String}` (primeros 8192 bytes de `~/.claude/skills/*/SKILL.md`; dirs sin SKILL.md se omiten; `dirs = dirs::home_dir()`); `#[tauri::command] async fn read_skill(dir: String) -> Result<SkillFile, String>` con `SkillFile {dir, content}` — **valida**: dir sin `/`, sin `\\`, sin `..`, sin `:` y que exista `{home}/.claude/skills/{dir}/SKILL.md`; si no, `Err("Skill no válido")`.

- [ ] **Step 1: Test Rust de validación**: `valid_dir("ui-styling") → Ok`, `valid_dir("../secrets") → Err`, `valid_dir("C:\\x") → Err`, `valid_dir("a/b") → Err`, `valid_dir("") → Err`, `valid_dir("no-existe-xyz") → Err`. Run: `cargo test` → FAIL.

- [ ] **Step 2: Implementar `skills.rs`** → `cargo test` PASS.

- [ ] **Step 3: Manual**: temporalmente invocar `list_skills` desde TS y loguear cuenta (~110 skills reales). Commit: `feat: acceso de solo lectura a ~/.claude/skills`

---

### Task 8: Parser de frontmatter y catálogo de skills (TS)

**Files:**
- Create: `src/lib/skills.ts`, `src/lib/skills.test.ts`
- Modify: `src/store/chat.ts` (carga catálogo al init: `invoke('list_skills')` → parse), Task 6 `ChatInput` (badge de skill activo con X)

**Interfaces:**
- Consumes: Task 7 (`SkillRaw`).
- Produces: `parseFrontmatter(raw: SkillRaw): SkillMeta | null` con `SkillMeta {dir, name, description}` — null si inválido; name fallback = dir. `buildCatalog(metas: SkillMeta[], builtins: BuiltinCmd[]): MenuItem[]` con builtins primero. `BUILTIN_CMDS: {name, description}[]` = `[{name:'model', …}, {name:'agents', …}, {name:'new', …}, {name:'clear', …}, {name:'theme', …}]` (descripciones en español del spec §7.2).

- [ ] **Step 1: Tests TDD del parser (Review Focus 3)**: frontmatter simple (`name: x\ndescription: y`); description multilínea `>-` (3 líneas plegadas); description entre comillas; sin `description` (name queda, description = ''); sin frontmatter (`---` ausente) → null; SKILL.md vacío → null; content cortado a 8KB a mitad del frontmatter → null (tolerante, no crash). Run → FAIL.

- [ ] **Step 2: Implementar parser** (split en el primer `---\n` y el siguiente `\n---`; name: línea que matchea `/^name:\s*(.+)$/m`; description: línea `description:` — si el valor es `>-`/`>`/`|`/`|-`, leer indentadas siguientes hasta menor indentación, plegar espacios; comillas: strip first/last si iguales; recorte con trim). Run → PASS.

- [ ] **Step 3: Tests de buildCatalog**: builtins primero; colisión de nombre (skill "model") → el built-in gana y el skill queda fuera del menú (spec §7.2.5); orden skills alfabético. → FAIL → implementar → PASS.

- [ ] **Step 4: Integración**: store carga catálogo al iniciar; badge sobre el input muestra skill activo + botón X (llama `clearSkill()`); slash "/" en primer carácter. Commit: `feat: catálogo de skills con parser frontmatter y badge activo`

---

### Task 9: SlashMenu (popup con filtro y teclado)

**Files:**
- Create: `src/components/SlashMenu.tsx`, `src/lib/slashMenu.ts`, `src/lib/slashMenu.test.ts`
- Modify: `src/components/ChatInput.tsx`

**Interfaces:**
- Consumes: Task 8 (`MenuItem[]`), Task 5 (`setSkill`, acciones de built-ins), Task 3 (ModelPicker abre con `/model`).
- Produces: `filterItems(items: MenuItem[], query: string): MenuItem[]` (substring case-insensitive sobre name+description); `nextIndex(i, len, dir)` / `handleMenuKey(e, state): 'select'|'close'|'none'|'move'`. SlashMenu: `role="listbox"` + opciones `role="option"` + `aria-selected` + `aria-activedescendant`.

- [ ] **Step 1: Tests TDD**: filterItems con "sty" matchea `ui-styling` y `design-system` (por descripción); query vacía → todo; sin matches → []; handleMenuKey: ArrowDown desde -1 → 0, ArrowUp desde 0 → último (wrap), Enter → 'select', Escape → 'close', otro → 'none'. Run → FAIL → implementar → PASS.

- [ ] **Step 2: Componente**: popup absoluto sobre el input, items con nombre mono + descripción muted, hover y selected con fondo `--muted`, máx-height scroll. `/` abre si el valor empieza con `/` y sin espacio antes; se cierra al enviar, blur con Esc o seleccionar. Built-ins ejecutan: `/new` → `newChat`, `/clear` → vacía mensajes del chat, `/theme` → cicla system→light→dark, `/model` → abre ModelPicker, `/agents` → cambia de vista (Task 14 lo consume; por ahora guarda `pendingView='agents'` en el store).

- [ ] **Step 3: Manual**: escribir "/" lista ~115 items, filtrar "ui-ux" encuentra el skill, Enter lo activa con badge, generar respuesta del modelo refleja el system prompt del skill. Commit: `feat: menú slash de skills con filtro y navegación por teclado`

---

### Task 10: Persistencia (historial, settings) en Rust + hidratación TS

**Files:**
- Create: `src-tauri/src/store_fs.rs`, `src/lib/persist.ts`, `src/lib/persist.test.ts`
- Modify: `src-tauri/src/lib.rs`, `src/store/chat.ts` (guardar tras done/error con debounce 800ms, cargar al init)

**Interfaces:**
- Consumes: Task 5 (`Chat[]`, settings default), Task 1.
- Produces (Rust): `#[tauri::command] async fn history_save(data: String) -> Result<(), String>` (escribe `appDataDir/history.json`, crea el directorio si falta), `history_load() -> Option<String>` (None si no existe; Err no: JSON corrupto retorna None), `history_delete(chat_id: String)` no — el TS reescribe el archivo completo; `settings_load()/settings_save(data)` igual con `settings.json`; `app_dir() -> String`. Tipos TS: `Settings` del spec §6 con defaults (`aliases` de Task 3, `defaultModel: 'glm-5.3-flash:cloud'`, `theme: 'system'`, `ollamaUrl: 'http://localhost:11434'`).
- Produces (TS): `hydrateHistory(raw: string | null): Chat[]` (JSON.parse tolerante: corrupto → []), `serializeChats(chats): string`.

- [ ] **Step 1: Test TS**: hydrateHistory con JSON válido (2 chats) → 2 chats; con `"{corrupto"` → []; con null → []. Run → FAIL → implementar → PASS.

- [ ] **Step 2: Rust fs** con `tauri::AppHandle::path().app_data_dir()`. `cargo test`: escribir history con JSON corrupto preexistente → `history_load` retorna None (fixture con archivo temporal).

- [ ] **Step 3: Integración store**: al init `settings_load` → settings al store (tema aplicado inmediatamente con Task 2), `history_load` → chats; tras cada `done`/`error`, debounce `history_save`. Manual: reiniciar la app conserva chats y settings. Commit: `feat: persistencia de chats y settings`

---

### Task 11: Sidebar (lista de chats, renombrar, borrar)

**Files:**
- Create: `src/components/Sidebar.tsx`
- Modify: `src/store/chat.ts` (`renameChat(id, title)`, `deleteChat(id)`, `setActive(id)`, `autoTitle` ya en Task 5)

**Interfaces:**
- Consumes: Task 5 (store), Task 10 (persistencia), Task 2 (tokens).
- Produces: Sidebar: botón "Nuevo chat" (Plus icon), lista con título + fecha relativa, botón borrar (Trash2, `aria-label="Eliminar chat"`, confirmación inline de 2 pasos: click → "¿Eliminar?" → click), doble click en título = editar (input inline), vista activa resaltada con `--primary` 2px izquierda, switch Chats/Agentes abajo, theme toggle (Sun/Moon), estado colapsable (ancho 260 ↔ 0 con animación 200ms).

- [ ] **Step 1: Acciones de store con test**: renameChat actualiza título; deleteChat del activo → activa otro o crea uno nuevo si no quedan. Run → FAIL → implementar → PASS.

- [ ] **Step 2: Componente + manual**: crear 2 chats, renombrar, borrar uno, persistencia sobrevive reinicio. Commit: `feat: sidebar de chats con renombrar y eliminar`

---

### Task 12: Equipos de agentes (tipos, store, editor)

**Files:**
- Create: `src/store/agents.ts`, `src/store/agents.test.ts`, `src/components/AgentsView.tsx`, `src/components/AgentCard.tsx`
- Modify: `src/App.tsx` (vista Chats/Agentes según estado), Task 10 (persistir `teams` en el mismo settings.json)

**Interfaces:**
- Consumes: Task 3 (lista de modelos), Task 8 (lista de skills para dropdown), Task 10 (persistencia).
- Produces: `useAgentsStore` con `teams: Team[]`, `activeTeamId`, acciones `addAgent(teamId)`, `updateAgent(teamId, agentId, patch)`, `removeAgent(teamId, agentId)`, `newTeam()`. `Agent` y `Team` del spec §6 (orchestratorModel default `'glm-5.3:cloud'`). Estado de ejecución de tarjetas: `runId?`, `status: 'idle'|'pending'|'generating'|'done'|'error'|'stopped'`, `thinking?`, `thinkingMs?`, `content?`, `error?`, `subtask?` (asignada por orquestador).

- [ ] **Step 1: Tests del store**: addAgent crea agente con defaults (nombre "Agente N", modelo default del settings, rol vacío); updateAgent cambia model; removeAgent; default orchestratorModel. Run → FAIL → implementar → PASS.

- [ ] **Step 2: Editor UI**: grid de AgentCard (input nombre, ModelPicker reutilizado, dropdown de skills con "Ninguna", textarea rol, botón eliminar), input "Nombre del equipo", botón "Añadir agente" (Plus), selector del líder (ModelPicker), persistencia automática. `/agents` de Task 9 ahora cambia de vista de verdad.

- [ ] **Step 3: Manual**: crear equipo de 2 agentes, persiste al reiniciar. Commit: `feat: editor de equipos de agentes`

---

### Task 13: Broadcast manual (paralelo)

**Files:**
- Create: `src/lib/agents.ts`, `src/lib/agents.test.ts`, `src/components/TeamRun.tsx`
- Modify: `src/store/agents.ts` (acción `runBroadcast(team, message)`), `src/components/AgentsView.tsx` (input de broadcast)

**Interfaces:**
- Consumes: Task 4/5 (`streamChat`, `handleChunk`-like), Task 12 (`Agent`, estados de tarjeta).
- Produces: `runBroadcast(team: Team, message: string, ollamaUrl: string): Promise<void>` — un `chat_start` por agente en paralelo (ids de generación UUID), chunks enrutan por generación al estado de cada tarjeta; espera todas con `Promise.allSettled`.

- [ ] **Step 1: Tests con mock-ipc**: 3 agentes → 3 invocations `chat_start` con mensajes [{role:'system', content: rol}] + user message; chunk thinking de la generación 2 → solo la tarjeta 2 acumula thinking; una generación con error → su tarjeta `error`, las otras `done` (aislamiento del spec §9); done → status 'done' + persistencia.
Run → FAIL → implementar → PASS.

- [ ] **Step 2: UI TeamRun**: tarjetas con estado (icono: CircleDashed pending, Loader2 girando generating, CheckCircle2 done, XCircle error), ThinkingPanel reutilizado por tarjeta, botón copiar respuesta, contador done/total. Input de broadcast arriba (mismo patrón de ChatInput sin slash).

- [ ] **Step 3: Manual con modelos reales**: broadcast a glm + deepseek en paralelo → ambas tarjetas streamean a la vez. Commit: `feat: broadcast paralelo a equipo de agentes`

---

### Task 14: Orquestador (líder → subtareas → síntesis)

**Files:**
- Create: `src/lib/orchestrator.ts`, `src/lib/orchestrator.test.ts`
- Modify: `src/store/agents.ts` (`runOrchestrated(team, goal, ollamaUrl)`), `src/components/TeamRun.tsx` (tarjeta líder + tarjeta síntesis), `src/components/AgentsView.tsx` (selector modo Manual/Orquestado)

**Interfaces:**
- Consumes: Task 13 (`runBroadcast` internals: expón `runGeneration(agentLike, messages, opts)` reutilizable), Task 12.
- Produces: `buildLeaderPrompt(team, goal): ChatMsg[]` (copy exacto abajo); `parseTasks(raw: string, team: Team): {tasks: {agent: Agent, prompt: string}[]} | null` (null si inválido o agentes inexistentes tras matching trim+case-insensitive); `runOrchestrated` con 1 retry con corrección y síntesis final.

**Copy del líder (fijo, español — es contrato del sistema):**
system: `Eres un orquestador de agentes. Divides una meta en subtareas y las asignas a los agentes del equipo. Responde SOLO con un bloque de código json, sin texto antes ni después, con este formato exacto: {"tareas":[{"agente":"<nombre exacto de un agente del equipo>","prompt":"<subtarea concreta en español>"}]} Reglas: cada subtarea debe ser necesaria para la meta, no repitas agente salvo que aporte valor, máximo una subtarea por agente.`; user: `Equipo:\n{por cada agente: "- {nombre}: {rol}"}\n\nMeta: {goal}`.

- [ ] **Step 1: Tests TDD de parseTasks**: JSON limpio con 2 tareas → 2 asignaciones en orden; ```json con ruido alrededor → parsea igual; objeto balanceado sin fence → parsea; JSON malformado → null; tarea con agente inexistente → null (tras matching: `" Analista Senior "` matchea `analista senior`, `"Analista-Senior"` matchea `analista-senior` — trim + lowercase + normalizar `-`/espacios; Review Focus 5); 0 tareas → null. Run → FAIL.

- [ ] **Step 2: Implementar parseTasks** (regex para ```json …``` con fallback a primer objeto balanceado por conteo de llaves; `JSON.parse` en try; validación de schema). Run → PASS.

- [ ] **Step 3: Tests de runOrchestrated con mock**: líder responde JSON válido → se llama `runGeneration` por subtarea en paralelo con la tarjeta correcta; líder responde malformado → 2ª llamada al líder con mensaje de corrección que incluye `"Tu respuesta anterior no era JSON válido: <err>"`; 2º fallo → error en tarjeta líder con el texto crudo (spec §7.4.3); subtareas done → síntesis: llamada al líder con `{"role":"user","content":"Resultados:\n{respuestas}\n\nMeta original: {goal}\nRedacta una respuesta final consolidada en español."}` → tarjeta "Síntesis" destacada; un agente con error → síntesis procede solo con los exitosos (spec §9).

- [ ] **Step 4: Implementar `runOrchestrated`** (usa streamChat; la respuesta del líder se acumula igual que un chat; el thinking del líder visible en su tarjeta). Run → PASS.

- [ ] **Step 5: UI**: tarjeta "Líder (glm-max)" arriba del grid con su thinking + JSON de subtareas visible al terminar; tarjetas de agentes muestran `subtask` como título; tarjeta "Síntesis" al final con estilo destacado (borde `--primary`). Modo Manual/Orquestado como toggle. Manual con modelos reales end-to-end. Commit: `feat: orquestador con subtareas paralelas y síntesis`

---

### Task 15: Pulido final (accesibilidad, reduced-motion, E2E, build)

**Files:**
- Modify: donde el E2E lo pida; `src/index.css` (reduced-motion global)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: app completa lista para uso diario.

- [ ] **Step 1: Audit de accesibilidad manual (checklist spec §8)**: Tab recorre: sidebar → chats → input → botones con focus ring `--ring` visible en ambos temas; SlashMenu navegable 100% por teclado; icon-only buttons con aria-label; contrastes ya verificados por test (Task 2); `@media (prefers-reduced-motion: reduce)` desactiva shimmer, loader giratorio y animaciones de altura (regla global: `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }`).

- [ ] **Step 2: E2E manual completo (flujos spec §7)**: 7.1 chat con thinking ✓; 7.2 slash + skill `/ui-ux-pro-max` activo ✓; 7.3 broadcast ✓; 7.4 orquestado con síntesis ✓; tabla §9: Ollama caído → banner; stop → "detenido por el usuario"; skill inválido no rompe el menú; dark mode en todos los componentes (no hay bordes/muted "claros" en dark).

- [ ] **Step 3: `npm run tauri build`** → Expected: compila el binario release (si falla por MSRV: `rustup update` y reintentar — riesgo §12).

- [ ] **Step 4: Commit final** `chore: pulido de accesibilidad y verificación e2e`

---

## Post-plan

Al terminar Task 15: revisión de rama completa (fresh reviewer) sobre el diff (`git log main`, ya que todo se hace en main con commits por task), luego actualizar `MEMORY.md` del proyecto si aplica y proponer `git init` del remote si el usuario quiere publicarlo.
