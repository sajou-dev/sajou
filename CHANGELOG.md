# Changelog

## v0.4.0 (2026-02-19)

- feat: p5.js editor with full pipeline integration (instance mode runtime, CodeMirror JS, params panel, 3 presets)
- feat: p5.js param annotations (`@param:` slider/color/toggle/xy, `@bind:` for wiring)
- feat: p5.js MCP endpoints (create, update, delete, set-param) — tool count 16→20
- feat: Auto-wire connected sources on import/connect
- feat: Selective import dialog (pick sections from ZIP)
- feat: Header redesign with grouped layout, undo/redo, help buttons
- feat: Shader + p5.js grouped in shared pipeline slot (keys 4/5)
- fix: Lazy panel init for persisted state (shader + p5)
- fix: p5 params panel losing sketch binding on switch
- docs: p5 editor guide, MCP server update, keyboard shortcuts update

## v0.3.0 (2026-02-18)

- feat: MCP server with 16 tools for AI agent integration
- feat: Shader tools (create, update, set_uniform via MCP)
- feat: Multi-instance semanticId resolution (group choreography)
- feat: Shared Actor ID with ×N badge in inspector
- feat: State sync (bidirectional browser ↔ dev server)
- feat: REST API endpoints for scene state, choreographies, bindings, wiring, shaders
- feat: Command consumer for external scene composition
- fix: MIDI binding pipeline (pitch_bend + continuous dispatch)
- docs: Comprehensive signal flow specification
- docs: Shared Actor ID feature guide

## v0.2.1

- fix: Exclude internal themes from public release
- fix: Various scene-builder UI improvements

## v0.2.0

- feat: C-shape filter blocks for when conditions
- feat: VitePress documentation site
- feat: Signal flow specification

## v0.1.0

- Initial release: scene-builder, choreographer runtime, signal protocol
