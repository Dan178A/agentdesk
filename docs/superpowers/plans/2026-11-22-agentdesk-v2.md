# AgentDesk — Plan v2.0 (Workbench + Rediseño)

> Origen: QA del 2026-11-22 (`.gstack/qa-reports/qa-report-agentdesk-2026-11-22.md`, ISSUE-002..009)
> y wishlist del usuario del mismo día. Aprueba: usuario (paquete completo, logo «constelación»).

**Goal:** llevar AgentDesk de "chat funcional" a escritorio de agentes estilo Claude Desktop:
panel de vista previa de archivos producidos por los agentes, adjuntos, creación de interfaces
in-app y un rediseño visual con logo propio.

## Fases (implementación incremental, commit por fase)

### Fase 1 — Identidad + pulido visual (ISSUE-009 y 006)
1. Logo «constelación»: nodo central conectado a 3 nodos, coral (#D97757) con degradado a ámbar.
   - `src/assets/AgentLogo.tsx` (componente SVG en línea, `currentColor`-friendly)
   - Íconos de Tauri: PNG 1024 desde el SVG + `npx tauri icon` (ruling #6 finalmente resuelta)
2. Sidebar: logo + wordmark, mejor jerarquía de secciones.
3. ChatView: header con título del chat + meter de contexto; empty state con arte
   (logo grande suave) + 3–4 chips de sugerencias de arranque.
4. Vista Agentes en frío: estado vacío ilustrado en vez del vacío muerto.
5. Tokens: `--warn` (ámbar) para ContextMeter, fuera `bg-amber-500` (ISSUE-001).

### Fase 2 — Panel de vista previa (ISSUE-003)
1. Rust: `read_file_preview(path)` con diálogo nativo (rfd/tauri dialog) y whitelist de
   extensiones; `write_file(path, content)` con confirmación JS.
2. Panel derecho colapsable (ancho ~40%, animación 200ms): renderiza HTML en `iframe`
   sandboxed, imágenes, CSV/tablas, código con highlight, markdown.
3. Los mensajes assistant con bloques de código HTML ganan botón «Abrir en panel».
4. Persistencia del estado del panel (abierto/contenido) en el chat.

### Fase 3 — Adjuntos + tool-use de agentes (ISSUE-002, 005)
1. Adjuntar archivo/carpeta en el chat (ChipInput, lista antes de enviar; contenido
   inyectado como system o user con fence por archivo).
2. `write_file` disponible para agentes: el modelo emite un bloque ```tool write_file
   y el store lo ejecuta + confirma en la tarjeta del agente.
3. Todo archivo escrito se registra y abre en el panel de vista previa.

### Fase 4 — Creador de interfaces (ISSUE-004)
1. Comando `/interface <descripción>`: el modelo genera una app HTML completa
   → se abre live en el panel (iframe) + botón «Guardar como archivo».
2. Historial de interfaces por proyecto.

## Decisión de diseño aprobada
- Logo: constelación/nodos (orquestación), coral con degradado sutil.
- Paleta: se mantiene Claude cálida (coral/crema del spec §8) con más profundidad en dark.
