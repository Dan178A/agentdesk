# AgentDesk — Progreso del proyecto

**Fecha de estado:** 2026-11-22 · **Versión:** 0.1.0 · **Rama:** `feature/agentdesk`

## ¿Qué es?

**AgentDesk** — app de escritorio estilo Claude Desktop que funciona como wrapper de chat contra tu
Ollama local, con panel de pensamiento del modelo en tiempo real, menú `/` que carga tus skills de
`~/.claude/skills`, equipos de agentes en paralelo (manual u orquestados por un líder) y medidor de
contexto con tokens reales.

## Stack

Tauri 2 (Rust delgado: ventana + proxy HTTP streaming + filesystem) · React 18 + TypeScript ·
Vite · Tailwind CSS v4 · zustand · react-markdown + rehype-highlight · Vitest + cargo test

## Cómo se ejecuta

```bash
cd C:\Users\DAN_PC\Documents\GitHub\agentdesk
npm run tauri dev     # desarrollo (requiere Ollama arriba)
npm run tauri build  # release
```

- **Binario:** `src-tauri\target\release\agentdesk.exe`
- **Instaladores:** `src-tauri\target\release\bundle\` → `AgentDesk_0.1.0_x64-setup.exe` (NSIS) y `.msi`
- Alias de modelos: `glm` → glm-5.3-flash:cloud · `glm-max` → glm-5.3:cloud · `deepseek` → deepseek-v4.1-flash:cloud

## Tareas completadas (17/17)

| # | Tarea | Estado |
|---|-------|--------|
| 1 | Esqueleto Tauri 2 + React + Vitest | ✅ |
| 2 | Tokens de diseño + tema + contraste WCAG (con test que valida la paleta) | ✅ |
| 3 | `list_models` (Rust) + catálogo con alias (TS) | ✅ |
| 4 | Streaming de chat: parser NDJSON, batching 16ms, stop/cancelación | ✅ |
| 5 | Store de chat: streaming, thinking, stop, skills, errores (9 casos) | ✅ |
| 6 | UI de chat: ThinkingPanel colapsable, markdown + código, input, picker | ✅ |
| 7 | Skills en Rust (list/read con validación anti-traversal, 6 tests) | ✅ |
| 8 | Parser frontmatter YAML-subset + catálogo (built-ins primero) | ✅ |
| 9 | SlashMenu: filtro en vivo, teclado ↑↓/Enter/Esc, ARIA listbox | ✅ |
| 10 | Persistencia: historial + settings JSON tolerantes, debounce 800ms | ✅ |
| 11 | **v1.1** Sidebar expandible con proyectos + chats (crear/renombrar/borrar) | ✅ |
| 12 | Equipos de agentes: editor (nombre, modelo, skill, rol), persistencia | ✅ |
| 13 | Broadcast paralelo con aislamiento de fallos (Promise.allSettled) | ✅ |
| 14 | Orquestador: líder → subtareas JSON (retry + matching tolerante) → síntesis | ✅ |
| 15 | Pulido: reduced-motion global, `tauri build` release verde | ✅ |
| 16 | **v1.1** Meter de contexto (tokens reales de Ollama) + Reintentar por mensaje | ✅ |
| 17 | **v1.1** Proyectos (cubierto por la Task 11 extendida) | ✅ |

**Tests:** 95/95 TS (Vitest) · 13/13 Rust (cargo test) · typecheck `tsc --strict` limpio

## Funciones implementadas

- ✅ Chat con streaming token a token contra `localhost:11434` (configurable)
- ✅ **Pensamiento del modelo**: panel colapsable con shimmer mientras genera, duración en segundos
- ✅ Menú `/`: tus ~110 skills reales de `~/.claude/skills` + comandos `/model /agents /new /clear /theme`
- ✅ Selector de modelo con los 3 alias arriba + todos los modelos de `ollama list`
- ✅ Multiagentes: modo manual (todos en paralelo) y modo orquestado (el líder glm-max divide la meta
  en subtareas JSON, despacha en paralelo y redacta la síntesis final); fallo de un agente no tumba al resto
- ✅ **Meter de contexto**: barra de tokens usados/total (límite real del modelo), ámbar ≥80%, rojo ≥95%
- ✅ Botón **Reintentar** en mensajes caídos (reenvía el último mensaje) y en el banner de Ollama caído
- ✅ Sidebar expandible/colapsable con **proyectos**, chats por proyecto, tema claro/oscuro
- ✅ Persistencia automática: chats, equipos, proyectos y settings en JSON (appDataDir)
- ✅ Código con syntax highlighting + copiar · stop de generación · dark/light mode · accesibilidad
  (contraste validado por test, focus rings, reduced-motion, iconos Lucide)

## Decisiones tomadas durante la implementación (rulings)

1. **WCAG manda**: `--primary-fg` en light pasó de `#FFFFFF` a `#1F1E1D` — el test de contraste
   probó que coral+blanco = 3.12:1 (<4.5 AA). Botón coral con texto oscuro.
2. **Rust 1.80 no compilaba Tauri 2.12** (edition2024): `rustup update` + override repo-local a stable
   (1.100.0) sin tocar el default global de tus otros proyectos.
3. **NDJSON se parsea en Rust** (con test de línea partida); TS recibe chunks tipados por Channel.
4. **Tokens reales** en vez de estimación: el done de Ollama trae `prompt_eval_count` + `eval_count`.
5. **Renombrar chat por doble click** quedó fuera de v1 (títulos automáticos; los proyectos sí se renombran).
6. Icono placeholder coral con "A" (reemplazable con `npx tauri icon <tu-png>`).

## Pendiente

- [ ] **E2E manual contigo** con modelos reales: chat con thinking, cargar `/ui-ux-pro-max`,
      broadcast a 2 agentes y una orquestación (la ventana dev está corriendo para probarlo)
- [ ] Merge de `feature/agentdesk` a `main` cuando lo apruebes
- [ ] Opcional después: tool-use real de los agentes, truncado automático de contexto, adjuntos

## Documentación del proyecto

- Spec de diseño: `docs/superpowers/specs/2026-11-22-agentdesk-design.md`
- Plan de implementación (17 tareas TDD): `docs/superpowers/plans/2026-11-22-agentdesk.md`
- Ledger del proceso (rulings completos): `.superpowers/sdd/2026-11-22-agentdesk/progress.md`
