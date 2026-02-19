# Changelog

## v0.5.6 (2026-02-19)

- feat(scene-builder): full-window preview mode (F key, auto-activates run mode + hand tool)
- fix(scene-builder): particle render order fix

## v0.5.5 (2026-02-19)

- feat: Tauri desktop app for macOS (ARM + Intel), Windows, and Linux
- feat: tauri-plugin-http for localhost mixed-content bypass
- feat: HTML confirm dialog (replaces broken window.confirm in WKWebView)

## v0.5.4 (2026-02-19)

- feat(scene-builder): persist active source connection across sessions
- feat(scene-builder): periodic local source rescan (30s interval)

## v0.5.3 (2026-02-19)

- feat(scene-builder): speech bubbles — Canvas2D overlay with streaming typewriter effect
- feat(scene-builder): per-entity speech bubble config (colors, opacity, tail position, retention, font size)
- feat(scene-builder): speech binding property in radial menu
- test: 26 speech bubble state tests

## v0.5.2 (2026-02-19)

- feat(scene-builder): binding transitions — animated float property bindings with easing
- feat(scene-builder): transition config popup in radial menu (scale, opacity, rotation, position)
- feat(scene-builder): easing functions: linear, easeIn, easeOut, easeInOut, arc
- test: 18 binding transition tests

## v0.5.1 (2026-02-19)

- feat(scene-builder): particle system — radial and directional emitters with color-over-life
- feat(scene-builder): particle tool (K key), particle panel with compass dial
- feat(scene-builder): glow particles (AdditiveBlending)
- feat(scene-builder): lighting system — ambient, directional, point lights with flicker
- feat(scene-builder): light tool (J key), lighting panel with Canvas2D dials

## v0.5.0 (2026-02-19)

- feat(scene-builder): OpenClaw signal source integration (auto-detect port 18789)
- feat(scene-builder): local signal source discovery (Claude Code, OpenClaw, LM Studio, Ollama)
- feat(scene-builder): platformFetch for Tauri/browser/proxy auto-selection
- test: 42 OpenClaw parser tests

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
