# CLAUDE.md — Instructions for AI agents working on Sajou

## What is Sajou?

Sajou is a **visual choreographer for AI agents**. It translates agent events into animated visual scenes via declarative choreographies. Read [SAJOU-MANIFESTO.md](./SAJOU-MANIFESTO.md) for the full vision.

**The 3-layer architecture is sacred:**
```
Signals (data) → Choreographer (sequences) → Theme (render)
```
Never shortcut signal → render. The choreography layer is the product.

## Core Principles (never violate these)

1. **Declarative first** — Choreographies and themes are JSON, not imperative code. The runtime interprets declarations. This is what makes Sajou composable by AIs.

2. **Core is framework-agnostic** — `@sajou/core` has zero framework dependencies. Vanilla TypeScript only. Themes choose their own render stack.

3. **Themes are complete scenes** — Not CSS skins. A theme provides entities, animations, sounds, layouts, choreographies, and its own renderers. Changing theme changes everything except the data.

4. **Backend-agnostic** — Sajou consumes a standardized signal stream (JSON over WebSocket). It never depends on a specific orchestrator.

5. **The entity format must be extensible** — From 2D sprites to animated spritesheets to 3D models (glTF) to particle systems. The schema must accommodate all levels without breaking simpler use cases.

---

## Project Structure

```
sajou/
├── packages/
│   ├── core/              # Signal bus + Choreographer runtime
│   │   ├── src/
│   │   │   ├── signal-bus/       # Signal reception, normalization, dispatch
│   │   │   ├── choreographer/    # Runtime that interprets choreography JSON
│   │   │   ├── primitives/       # Built-in action types (move, spawn, fly...)
│   │   │   └── index.ts
│   │   ├── tests/
│   │   └── package.json
│   ├── schema/            # JSON Schemas (signals, choreographies, themes, entities)
│   │   ├── src/
│   │   │   ├── signal.schema.json
│   │   │   ├── choreography.schema.json
│   │   │   ├── theme.schema.json
│   │   │   └── entity.schema.json
│   │   └── package.json
│   ├── theme-api/         # Theme contract and renderer interfaces
│   │   ├── src/
│   │   │   ├── types.ts          # ThemeManifest, Renderer, EntityDefinition...
│   │   │   └── index.ts
│   │   └── package.json
│   ├── theme-citadel/     # WC3-inspired theme (reference implementation)
│   │   ├── src/
│   │   │   ├── renderers/        # One renderer per primitive
│   │   │   ├── entities/         # Entity definitions and assets
│   │   │   ├── choreographies/   # Theme-specific choreography JSONs
│   │   │   └── index.ts
│   │   ├── assets/               # Sprites, models, sounds
│   │   └── package.json
│   └── emitter/           # Test signal emitter
│       ├── src/
│       │   ├── scenarios/        # Predefined signal sequences
│       │   └── index.ts
│       └── package.json
├── adapters/
│   ├── test/              # Dev signal source (WebSocket server)
│   └── openclaw/          # OpenClaw → Sajou signal bridge
├── SAJOU-MANIFESTO.md
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
| `@sajou/theme-api` | Theme contract interfaces | `@sajou/schema` |
| `@sajou/theme-citadel` | WC3 theme implementation | `@sajou/theme-api`, `@sajou/core` |
| `@sajou/emitter` | Test signal emitter | `@sajou/schema` |

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

### Theme Package Rules
- A theme chooses its own rendering stack (Three.js, PixiJS, Canvas 2D, SVG...).
- A theme must implement the `ThemeContract` interface from `@sajou/theme-api`.
- A theme must provide renderers for all choreographer primitives.
- A theme declares its available entities and their visual properties in a JSON manifest.
- Theme-specific dependencies (Three.js, etc.) live only in the theme's `package.json`.

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
- Package names: `@sajou/core`, `@sajou/schema`, `@sajou/theme-api`, `@sajou/theme-citadel`, `@sajou/emitter`

### Signals & Choreographies (JSON)
- `snake_case` for signal types: `task_dispatch`, `tool_call`, `token_usage`
- `camelCase` for choreography action names: `move`, `spawn`, `flyTo`, `drawBeam`
- `camelCase` for all JSON property names in schemas

---

## Git Workflow

### Branch Strategy
```
main                    ← stable, all tests pass
├── feat/schema-v1      ← schema agent works here
├── feat/core-runtime   ← core agent works here
├── feat/theme-citadel  ← theme agent works here
```

### Branch Naming
- `feat/<package>-<description>` — new feature: `feat/core-choreographer-runtime`
- `fix/<package>-<description>` — bug fix: `fix/schema-signal-validation`
- `refactor/<package>-<description>` — refactor: `refactor/core-primitive-types`
- `explore/<topic>` — exploration/prototyping: `explore/entity-format-3d`

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
Scopes: `core`, `schema`, `theme-api`, `theme-citadel`, `emitter`, `adapters`

### Rules
- Every commit must compile (`pnpm typecheck` passes)
- Every commit should have passing tests (`pnpm test` passes)
- Never commit directly to `main` — always branch and merge
- Small, focused commits. One concern per commit.
- If a change touches multiple packages, split into separate commits per package.

---

## Process for Open Questions

Several design decisions are intentionally left open. They need exploration, prototyping, and challenging — not premature locking.

### How to Explore
1. **Create an `explore/` branch** with a prototype
2. **Write an ADR** (Architecture Decision Record) in `docs/adr/` with:
   - Context: what problem are we solving?
   - Options considered (at least 2)
   - Tradeoffs of each
   - Recommendation
3. **Build a minimal proof-of-concept** that validates the recommendation
4. **Commit the ADR + PoC** for review before implementing in the main codebase

### Open Questions for V1

#### 1. Entity Format
How do we describe entities declaratively across complexity levels?
- Static sprites (PNG, SVG)
- Animated sprites (spritesheets, frame sequences)
- 3D models (glTF with skeletal animations)
- Particle systems
- Procedural/shader effects

The format must be rich enough for a WC3 theme but simple enough for an AI to generate. **This is the hardest design problem in V1.**

#### 2. Choreographer Runtime
- How do we handle concurrent choreographies? (multiple signals arriving simultaneously)
- How do we handle interruptions? (error mid-animation)
- What's the easing/timing system? (keyframes? tweens? physics-based?)
- How does the choreographer communicate with theme renderers? (events? callbacks? observable state?)

#### 3. Signal Protocol
- What's the minimal set of signal types for V1?
- How do we handle signal ordering and timing?
- What metadata does a signal carry?
- Do we need signal acknowledgment / completion feedback?

#### 4. Theme ↔ Choreographer Contract
- Does the theme just provide renderers, or does it also contribute choreographies?
- How does a theme declare its capabilities? (e.g., "I support 3D entities" vs "I only do 2D")
- How does the choreographer know what entities a theme has?

---

## Working with this Codebase

### Bootstrap (repo initialization)
```bash
pnpm init
# Create pnpm-workspace.yaml with packages/* and adapters/*
# Create tsconfig.base.json with strict mode
# Create each package with its own package.json and tsconfig.json
# Setup Vitest config
# Setup Vite config for dev server
```

### Adding a new primitive to the choreographer
1. Define the action type in `packages/schema/` (JSON Schema + TypeScript type)
2. Implement the runtime logic in `packages/core/src/primitives/`
3. Add the renderer interface in `packages/theme-api/`
4. Implement the renderer in `packages/theme-citadel/`
5. Add tests at every layer
6. Document the primitive in the schema with `description` fields

### Modifying the signal protocol
1. Update the JSON Schema in `packages/schema/`
2. Update the signal bus in `packages/core/`
3. Update the emitter in `packages/emitter/`
4. Update any affected choreographies

### Working on the theme
- The theme implements renderers for each choreographer primitive
- The theme owns its visual stack (Three.js for Citadel)
- The theme declares its available entities and their visual properties
- Test with the emitter, not a real backend
- Theme-specific logic never leaks into `@sajou/core`

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

## What NOT to do

- **Don't couple core to any rendering library** — no Three.js, no PixiJS, no DOM in `@sajou/core`
- **Don't hardcode theme-specific logic in the choreographer** — the choreographer doesn't know about peons or pigeons
- **Don't bypass the choreography layer** — signal → render directly is forbidden
- **Don't use imperative code where declarative JSON works** — if it can be a schema, it should be
- **Don't optimize prematurely** — clarity over performance in V1
- **Don't modify `@sajou/schema` without coordination** — it's the shared contract
- **Don't add dependencies to `@sajou/core`** — zero deps means zero deps
- **Don't commit without tests** — if you write runtime logic, test it
