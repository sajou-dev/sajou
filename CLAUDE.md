# CLAUDE.md — Instructions for AI agents working on Sajou

## What is Sajou?

Sajou is a **visual choreographer for AI agents**. It translates agent events into animated visual scenes via declarative choreographies. Read [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md) for the full vision.

**The 3-layer architecture is sacred:**
```
Signals (data) → Choreographer (sequences) → Stage (render)
```
Never shortcut signal → render. The choreography layer is the product.

> **Historical note:** Early docs and ADRs refer to "Theme" as the render layer. The concept evolved into **Stage** (`@sajou/stage`, Three.js). The packages `theme-api`, `theme-citadel`, and `theme-office` are archived prototypes (PixiJS v8) that predate the Stage layer. They remain in the repo for reference but are not used in production.

## Core Principles (never violate these)

1. **Declarative first** — Choreographies and scenes are JSON, not imperative code. The runtime interprets declarations. This is what makes Sajou composable by AIs.

2. **Core is framework-agnostic** — `@sajou/core` has zero framework dependencies. Vanilla TypeScript only. The Stage chooses its own render stack.

3. **The Stage is a complete scene** — Not a CSS skin. The Stage provides entities, animations, sounds, layouts, and its own renderer (Three.js). Changing scene changes everything except the data.

4. **Backend-agnostic** — Sajou consumes a standardized signal stream (JSON over WebSocket). It never depends on a specific orchestrator.

5. **The entity format must be extensible** — From 2D sprites to animated spritesheets to 3D models (glTF) to particle systems. The schema must accommodate all levels without breaking simpler use cases.

---

## Project Structure

```
sajou/
├── packages/
│   ├── core/              # Signal bus + Choreographer runtime (vanilla TS, zero deps)
│   ├── schema/            # JSON Schemas + TypeScript types for signal protocol
│   ├── stage/             # Three.js renderer library (EntityManager, cameras, lights)
│   ├── mcp-server/        # MCP server — AI agent integration via Model Context Protocol
│   ├── emitter/           # Test signal emitter (WebSocket)
│   ├── theme-api/         # [archived] Theme contract interfaces (PixiJS era)
│   ├── theme-citadel/     # [archived] WC3/Tiny Swords prototype (PixiJS v8)
│   └── theme-office/      # [archived] Corporate/office prototype (PixiJS v8)
├── adapters/
│   └── tap/               # Signal tap — CLI + adapters to connect Claude Code → scene-builder
├── tools/
│   ├── scene-builder/     # Visual scene editor — main authoring tool (Vite + Three.js)
│   ├── site/              # Web deployment (VitePress docs, sajou.app static build)
│   ├── player/            # Scene player (orphaned — no package.json, dist only)
│   └── entity-editor/     # Entity editor (frozen — superseded by scene-builder)
├── tests/
│   └── integration/       # Cross-package integration tests
├── docs/
│   ├── backlog/           # Raw ideas — one markdown file per idea
│   ├── active/            # Ideas currently in development
│   ├── done/              # Completed and merged ideas
│   ├── specs/             # Technical reference documents
│   ├── guide/             # User-facing guides (signal flow, shaders, wiring, etc.)
│   ├── reference/         # Reference docs (scene format, signal protocol, shortcuts)
│   ├── decisions/         # Technical decisions and their context
│   ├── features/          # Feature design docs
│   ├── marketing/         # Product plan, positioning, launch — NOT technical guidelines
│   ├── adr/               # Architecture Decision Records
│   ├── archive/           # Archived specs (implemented, kept for reference)
│   └── brand/             # Brand guide and assets
├── scripts/               # Release and deploy scripts
├── SAJOU-MANIFESTO.md
├── ARCHITECTURE.md        # Current state of the codebase
├── CLAUDE.md
├── README.md
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── vitest.config.ts
```

### Package Ownership (multi-agent)

Multiple agents may work in parallel. Each agent owns a specific package. **Never modify files outside your assigned package without explicit coordination.**

| Package | Responsibility | Dependencies |
|---------|---------------|--------------|
| `@sajou/schema` | JSON Schemas, TypeScript types generated from schemas | None |
| `@sajou/core` | Signal bus, choreographer runtime, primitives | `@sajou/schema` |
| `@sajou/stage` | Three.js renderer library (entities, cameras, lights, textures) | `@sajou/core`, `three` |
| `@sajou/mcp-server` | MCP server for AI agent integration (published on npm) | `@modelcontextprotocol/sdk`, `express`, `zod` |
| `@sajou/emitter` | Test signal emitter (WebSocket) | `@sajou/schema` |
| `@sajou/tap` | Signal tap — CLI adapters to connect local agents | `@sajou/schema`, `ws` |
| `@sajou/theme-api` | [archived] Theme contract interfaces | `@sajou/schema` |
| `@sajou/theme-citadel` | [archived] WC3/Tiny Swords prototype (PixiJS v8) | `@sajou/theme-api`, `@sajou/core` |
| `@sajou/theme-office` | [archived] Corporate/office prototype (PixiJS v8) | `@sajou/theme-api`, `@sajou/core` |

> **Note:** `@sajou/mcp-server` is standalone — it does NOT depend on `@sajou/core` or `@sajou/schema`. It manages scene state independently via its own in-memory store. This is by design: the MCP server is a state authority, not part of the signal → choreographer → stage pipeline.

### Tools

| Tool | Status | Description |
|------|--------|-------------|
| `scene-builder` | Active | Visual scene editor — main authoring tool. Three.js + Canvas2D, wiring, shaders, sketches, export/import ZIP, run mode. Tauri desktop shell available. |
| `site` | Active | Web deployment — VitePress docs site, sajou.app static build |
| `player` | Orphaned | Scene player — `dist/` exists but no `package.json`. Needs rebuild or removal. |
| `entity-editor` | Frozen | Superseded by scene-builder |

**Rule: `@sajou/schema` is the shared contract.** Any change to schemas must be discussed and validated before implementation. If you need a schema change, propose it as a separate commit with justification — don't just change it.

---

## Technical Constraints

### Language & Build
- **TypeScript** in strict mode. No `any`, no `as unknown as`, no `@ts-ignore`.
- **pnpm workspaces** for monorepo management
- **Vite** for building and dev server
- **Vitest** for all tests

### Core Package Rules
- **Zero external dependencies.** Vanilla TypeScript only. No lodash, no RxJS, no framework.
- The core must run in browser and Node.js environments.
- All choreographer logic must be unit-testable without any rendering.

### Schema Package Rules
- All declarative formats (signals, choreographies, themes, entities) must have a JSON Schema.
- TypeScript types should be generated from or aligned with JSON Schemas — schemas are the source of truth.
- Schemas must be documented with `description` fields on every property — these serve as LLM documentation.

### Stage Package Rules
- `@sajou/stage` is the Three.js renderer library — it receives commands from the choreographer.
- Stage depends on `@sajou/core` for types and on `three` for rendering.
- Stage owns: EntityManager, LightManager, TextureLoader, cameras, CommandSink.
- Stage-specific dependencies (Three.js) live only in its own `package.json`.
- Scene-builder imports from `@sajou/stage` — never from Three.js directly for entity/scene management.

---

## Naming Conventions

### Files & Directories
- `kebab-case` for all file and directory names: `signal-bus.ts`, `theme-citadel/`
- One concept per file. No god files.
- Test files: `*.test.ts` colocated next to source or in `tests/` directory

### Code
- `PascalCase` for types and interfaces: `SignalEvent`, `ChoreographyStep`, `ThemeManifest`
- `camelCase` for functions and variables: `dispatchSignal`, `registerChoreography`
- `UPPER_SNAKE_CASE` for constants: `DEFAULT_EASING`, `MAX_CONCURRENT_CHOREOGRAPHIES`
- Interfaces over classes when possible
- Prefix interfaces with purpose, not `I`: `ThemeRenderer` not `IRenderer`

### Packages
- npm scope: `@sajou/`
- Package names: `@sajou/core`, `@sajou/schema`, `@sajou/stage`, `@sajou/mcp-server`, `@sajou/emitter`, `@sajou/tap`
- Archived: `@sajou/theme-api`, `@sajou/theme-citadel`, `@sajou/theme-office`

### Signals & Choreographies (JSON)
- `snake_case` for signal types: `task_dispatch`, `tool_call`, `token_usage`
- `camelCase` for choreography action names: `move`, `spawn`, `flyTo`, `drawBeam`
- `camelCase` for all JSON property names in schemas

---

## Git Workflow

### Branch Strategy — 3-tier model

Branches follow sajou's 3-layer architecture. **Never work directly on `main`.**

```
main                         ← stable, tagged releases only (semver v0.x.x)
├── core/<description>       ← engine, runtime, orchestration, schema
├── interface/<description>  ← UI, scene-builder, player, user-facing
├── infra/<description>      ← config, deploy, build, network, tooling
└── fix/<description>        ← bug fixes (any tier)
```

**Tier mapping:**

| Tier | Branch prefix | Scope examples |
|------|--------------|----------------|
| **Core** | `core/` | `@sajou/schema`, `@sajou/core`, `@sajou/stage`, `@sajou/emitter`, `@sajou/tap`, choreographer runtime, signal protocol |
| **Interface** | `interface/` | `scene-builder`, `mcp-server`, `site`, `player`, UI components, visual tooling |
| **Infra** | `infra/` | `vite.config`, `tsconfig`, CI/CD, pnpm workspace, deployment, dev server plugins |
| **Fix** | `fix/` | Bug fixes in any tier — name should indicate the affected area |

### Standalone docs go directly to `main`

Docs that don't accompany a code change — backlog ideas, decisions, specs updates — are committed directly to `main`. They are project memory, not features; blocking them on a branch makes them invisible and causes conflicts.

Only docs that are part of a code change (e.g. an ADR tied to a new feature, types documentation for a schema change) follow the feature branch.

### Active branch enforcement (Claude Code MUST do this)

1. **Before starting any change**: check the current branch (`git branch --show-current`). If on `main`, create or switch to the appropriate tier branch — **unless the change is a standalone doc** (see above). **Never commit code to `main`.**

2. **During a session**: if the user's work drifts to a different tier (e.g. working on `interface/scene-builder-ui` but starting to modify `packages/core/`), **immediately flag it**: "This change looks like `core/` scope — want me to switch branches or split the work?"

3. **At commit time**: verify that staged changes match the branch tier. If a single file contains cross-tier changes, use `git add -p` to stage only the relevant hunks. If the mix is too entangled, ask the user how to split.

4. **Merge to `main`**: only when a branch is complete and all tests pass. Always use `git merge --no-ff` to preserve branch history.

5. **Tagging**: `main` is tagged with semver `v0.x.x` on user request when a stable state is reached. Use `git tag -a v0.x.x -m "description"`.

### Commit Convention
```
<type>(<scope>): <description>

feat(core): implement choreography sequencer
fix(schema): add missing duration field to move action
test(core): add concurrent choreography tests
docs(schema): document entity format options
explore(theme-api): prototype renderer interface for 3D entities
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `explore`
Scopes: `core`, `schema`, `stage`, `mcp-server`, `emitter`, `tap`, `scene-builder`, `site`, `player`

### Rules
- Every commit must compile (`pnpm typecheck` passes)
- Every commit should have passing tests (`pnpm test` passes)
- **Never commit code to `main`** — always branch and merge. Standalone docs (backlog, decisions, specs) are the exception.
- Small, focused commits. One concern per commit.
- If a change touches multiple packages, split into separate commits per package.

---

## Ideas, Specs & Decisions

### Directory structure

```
docs/
├── backlog/        → raw ideas, one per markdown file
├── active/         → currently in development
├── done/           → completed and merged
├── specs/          → technical reference documents
├── guide/          → user-facing guides (signal flow, shaders, wiring, persistence, etc.)
├── reference/      → reference docs (scene format, signal protocol, keyboard shortcuts)
├── features/       → feature design documents
├── decisions/      → session-level technical choices and their context
├── adr/            → foundational architecture decisions (numbered, rare)
└── archive/        → archived specs (implemented, kept for reference)
```

### Backlog format

Each idea is a minimal markdown file in `backlog/`. Filename in `kebab-case` (e.g. `smart-interruption-system.md`).

```markdown
# Titre de l'idée
Tiers: core | interface | infra
---
Description libre, aussi courte ou longue que nécessaire.
```

No version, no priority, no date, no status. **The directory the file lives in IS the status.**

### Lifecycle

1. **Creation** — when the user mentions an idea in the chat, create the file in `backlog/`. Don't ask for clarifications, capture the idea as-is.
2. **Activation** — when the user decides to work on an idea, move the file from `backlog/` to `active/`, enrich with technical details if needed, and create the corresponding Git branch (matching the tier).
3. **Completion** — when the branch is merged into `main`, move the file from `active/` to `done/`, append the tag version and date at the bottom.
4. **Grouping** — when activating an idea, check `backlog/` for related ideas that would make sense to tackle together.

### Technical decisions — two levels

**`docs/decisions/`** — session-level choices. Frequent, lightweight. "We chose X over Y for this feature." Create a file in `kebab-case` whenever a meaningful technical choice is made during a session.

```markdown
# Titre de la décision
Date: YYYY-MM-DD
Contexte: pourquoi la question se posait
Décision: ce qu'on a choisi
Alternatives envisagées: ce qu'on a écarté
Raison: pourquoi ce choix et pas les autres
```

**`docs/adr/`** — foundational architecture decisions. Rare, numbered (`001-`, `002-`, ...), long-lived. These define the structural pillars of the project (signal protocol, choreographer runtime, entity format, renderer stack). An ADR is created only when a decision shapes the overall architecture, not for day-to-day choices.

**When to use which:**
- Choosing a library, a naming convention, a data format for a feature → `decisions/`
- Defining how an entire subsystem works, its contracts, invariants, and trade-offs → `adr/`

Don't log raw conversations. Capture only the decisions and their context. These files serve as the project's technical memory.

### Rules

- Never modify the content of files in `backlog/` unless explicitly asked
- Never delete files — everything goes through the `backlog → active → done` cycle
- `specs/` are technical reference documents independent of the idea lifecycle. Create or update them when a feature requires it.
- The user can create backlog files themselves at any time — Claude Code must not impose strict formatting beyond the minimum above
- `marketing/` contains product positioning, launch plans, and market analysis. These documents are **not technical guidelines** — they inform strategy, not code. Never treat their content as implementation requirements.

---

## Working with this Codebase

### Adding a new primitive to the choreographer
1. Define the action type in `packages/schema/` (JSON Schema + TypeScript type)
2. Implement the runtime logic in `packages/core/src/primitives/`
3. Implement the command handler in `packages/stage/` (CommandSink)
4. Add tests at every layer
5. Document the primitive in the schema with `description` fields

### Modifying the signal protocol
1. Update the JSON Schema in `packages/schema/`
2. Update the signal bus in `packages/core/`
3. Update the emitter in `packages/emitter/`
4. Update any affected choreographies
5. If the MCP server exposes the signal type, update `packages/mcp-server/` too

### Working on the Stage renderer
- `@sajou/stage` receives commands from the choreographer via `CommandSink`
- Stage owns: EntityManager, LightManager, TextureLoader, cameras
- Three.js is the render stack — all 3D/2D rendering goes through it
- Test with the emitter or scene-builder, not a real backend
- Stage-specific logic never leaks into `@sajou/core`

---

## Code Style

- Explicit types, no `any`
- Small, focused functions (< 40 lines preferred)
- Interfaces over classes when possible
- Pure functions where possible — side effects at the edges
- Name things by what they do, not how they work
- Comments explain *why*, not *what*
- French in manifesto and vision docs, English in code and technical docs
- Every public function and type must have a JSDoc comment

---

## Brand Guidelines

**The brand guide is the single source of truth for all visual and identity decisions.** Read and follow [docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md](./docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md) before any UI, documentation, or marketing work.

### Key Rules
- Always write "sajou" in **lowercase** — never "Sajou", "SAJOU", or "SaJou" (except at sentence start where unavoidable).
- Use the **SVG assets** provided in `docs/brand/sajou-brand_dev-kit_001/` (logomark, logotype, lockup, favicon, layer icons). Never recreate or approximate them.
- Respect the **color palette** (Ember theme): accent `#E8A851`, dark backgrounds `#07070C`/`#0E0E16`/`#14141F`, never pure black `#000000`.
- Use the **typography stack**: Sora (display), JetBrains Mono (code/labels), DM Sans (body).
- Use the **3 custom layer icons** (`icon-signal.svg`, `icon-choreographer.svg`, `icon-theme.svg`) to represent the architecture layers. For generic UI icons, use **Lucide Icons**.
- Follow the **logomark size rules**: full version ≥96px, simplified ears 48–96px, no ears 32–48px, favicon ≤32px.
- Apply the **UI component specs** (badges, cards, buttons, border-radius scale) defined in the brand guide.

### Available Brand Assets
```
docs/brand/sajou-brand_dev-kit_001/
├── SAJOU-BRAND.md                    # Full brand guide (source of truth)
├── sajou-favicon.svg                 # 32×32 simplified logomark
├── sajou-logomark-dark.svg           # Logomark for dark backgrounds
├── sajou-logomark-light.svg          # Logomark for light backgrounds
├── sajou-logotype-dark.svg           # Wordmark for dark backgrounds
├── sajou-logotype-light.svg          # Wordmark for light backgrounds
├── sajou-lockup-horizontal-dark.svg  # Logo + tagline for dark backgrounds
├── sajou-lockup-horizontal-light.svg # Logo + tagline for light backgrounds
├── icon-signal.svg                   # Signal layer icon
├── icon-choreographer.svg            # Choreographer layer icon
└── icon-theme.svg                    # Theme layer icon
```

When in doubt about any visual decision, defer to the brand guide.

---

## What NOT to do

- **Don't couple core to any rendering library** — no Three.js, no PixiJS, no DOM in `@sajou/core`
- **Don't hardcode scene-specific logic in the choreographer** — the choreographer doesn't know about peons or pigeons
- **Don't bypass the choreography layer** — signal → render directly is forbidden
- **Don't use imperative code where declarative JSON works** — if it can be a schema, it should be
- **Don't optimize prematurely** — clarity over performance in V1
- **Don't modify `@sajou/schema` without coordination** — it's the shared contract
- **Don't add dependencies to `@sajou/core`** — zero deps means zero deps
- **Don't commit without tests** — if you write runtime logic, test it
- **Don't deviate from the brand guide** — colors, typography, logo usage, and icon choices are defined in `docs/brand/sajou-brand_dev-kit_001/SAJOU-BRAND.md`. Don't invent new colors, swap fonts, or recreate logo assets

---

## End-of-chapter protocol

**This protocol is mandatory.** Execute it every time you finish implementing a work chapter (a plan, a feature branch, a coherent set of tasks). Do not skip any step.

1. **Update reference documentation** — reflect the changes in the relevant docs (`ARCHITECTURE.md`, `CLAUDE.md`, ADRs, etc.). The codebase docs must stay in sync with the code.

2. **Update guides and reference docs** — if the change affects user-facing behavior, a system described in the guides, or a reference format, update the corresponding page in `docs/guide/` or `docs/reference/`. New systems get a new page. These docs are the project's living manual — they must stay accurate.

3. **Log remarks, ideas, and open questions** — during implementation, ideas, edge cases, future improvements, and unresolved questions inevitably surface. Capture them in a dedicated section at the end of your work summary so we can integrate them into the next work plan. Nothing should be lost to context window eviction.
