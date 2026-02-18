# Choreographer — Signal Flow & Entity Assignments

Reference technique du flux complet : de l'arrivee d'un signal externe jusqu'a la modification
d'une entite sur la scene Three.js. Ce document couvre la mecanique interne du scene-builder.

---

## Vue d'ensemble

Deux pistes paralleles s'activent simultanement quand un signal arrive en run mode :

```
Signal Source (WebSocket / SSE / OpenAI / Anthropic / OpenClaw / MIDI / Timeline)
       |
       v
  dispatchSignal()
       |
  +----+------------------------+
  |                             |
  v                             v
Track A: Choreographer       Track B: BindingExecutor
(sequences de steps)         (assignations directes)
  |                             |
  v                             v
RunModeSink                  handle.property = value
(CommandSink)
  |
  v
DisplayObjectHandle
(Three.js mesh)
```

**Track A** execute des sequences declaratives (move, fly, flash, wait, spawn...).
**Track B** assigne directement des proprietes d'entites (opacity, rotation, animation.state...).

Les deux tracks partagent le meme `RenderAdapter` et les memes `DisplayObjectHandle`.

---

## Etape 1 — Ingestion du signal

**Fichier** : `tools/scene-builder/src/simulator/signal-connection.ts`

Chaque source se connecte via un protocole (WS, SSE, OpenAI, Anthropic, OpenClaw, MIDI).
Le message brut est parse en un `ReceivedSignal` :

```typescript
interface ReceivedSignal {
  id: string;
  type: SignalType;       // "task_dispatch", "tool_call", "text_delta"...
  timestamp: number;
  source: string;         // source ID
  correlationId?: string; // threading pour les interruptions
  payload: Record<string, unknown>;
  raw: string;
}
```

`dispatchSignal(signal, sourceId)` distribue le signal a tous les `signalListeners[]` enregistres.

### Protocoles supportes

| Protocole | Detection | Parsing |
|-----------|-----------|---------|
| `websocket` | `ws://` / `wss://` | `parseMessage()` |
| `sse` | HTTP(S) stream | `readSSEStream()` → `parseMessage()` |
| `openai` | `/v1/models` probe | `parseOpenAIChunk()` |
| `anthropic` | URL contient "anthropic" | `parseAnthropicEvent()` |
| `openclaw` | port 18789 ou "openclaw" | handshake + `parseOpenClawEvent()` |
| `midi` | scheme `midi://` | `parseMIDIMessage()` |
| `timeline` | playback local | `emitTimelineSignals()` direct |

Tous convergent vers `dispatchSignal()`.

---

## Etape 2 — Routage par le systeme de wiring

**Fichiers** : `state/wiring-state.ts`, `state/wiring-queries.ts`

Le wiring forme un **patch bay** a trois couches :

```
Source ──wire──> Signal Type ──wire──> Choreography
  (signal)         (signal-type)        (choreographer)
```

### Definition d'un wire

```typescript
interface WireConnection {
  id: string;
  fromZone: "signal" | "signal-type" | "choreographer";
  fromId: string;
  toZone: "signal-type" | "choreographer" | "theme" | "shader";
  toId: string;
}
```

### Resolution du routage

`getChoreoInputInfo(choreoId)` determine quels signal types declenchent une choregraphie :

```typescript
interface ChoreoInputInfo {
  wiredTypes: string[];       // types venant des wires explicites
  defaultType: string;        // le champ choreo.on (fallback)
  hasWires: boolean;
  effectiveTypes: string[];   // wiredTypes si hasWires, sinon [defaultType]
}
```

**Regle** : si des wires `signal-type → choreographer` existent, ils sont autoritaires.
Sinon, le champ `ChoreographyDef.on` sert de fallback.

---

## Etape 3 — Gate d'entree en run mode

**Fichier** : `run-mode/run-mode-controller.ts`

`startRunMode()` :
1. Snapshot de l'etat de toutes les entites (position, scale, rotation, opacity, visible)
2. Import dynamique de `@sajou/core`
3. Creation de la stack : `ThreeAdapter → RunModeSink → BrowserClock → Choreographer`
4. Conversion des `ChoreographyDef[]` (format editeur) en `ChoreographyDefinition[]` (format runtime) via `convertToRuntime()`
5. `choreographer.registerAll(definitions)`
6. Creation du `BindingExecutor`
7. Abonnement a `onSignal()` :

```typescript
onSignal((signal) => {
  // Gate : est-ce qu'au moins une choregraphie ecoute ce type ?
  for (const choreo of choreographies) {
    const info = getChoreoInputInfo(choreo.id);
    if (info.effectiveTypes.includes(signal.type)) { matched = true; break; }
  }
  if (!matched) return;

  // Track A : steps
  choreographer.handleSignal(
    { type: signal.type, payload: signal.payload },
    signal.correlationId,
  );

  // Track B : bindings
  bindingExecutor.handleSignal({
    type: signal.type,
    payload: signal.payload,
  });
});
```

### `convertToRuntime()` — format editeur → format runtime

- Supprime les champs editeur : `id`, `nodeX`, `nodeY`, `collapsed`
- Aplatit `ChoreographyStepDef.params` dans l'objet step (le runtime attend des steps plats)
- Resout `entity` : step.entity → choreo.defaultTargetEntityId → omis
- Recurse dans `children` pour les actions structurelles (`parallel`, `onArrive`, `onInterrupt`)

---

## Etape 4 — Choreographer runtime (Track A)

**Fichiers** : `packages/core/src/choreographer/`

### Dispatch (`choreographer.ts`)

```typescript
handleSignal(signal, correlationId) {
  const definitions = registry.getForSignalType(signal.type);
  for (const def of definitions) {
    if (!matchesWhen(def.when, signal)) continue;
    if (def.interrupts && correlationId) {
      scheduler.interruptByCorrelationId(correlationId, signal.type);
    }
    scheduler.startPerformance(def, signal, correlationId);
  }
}
```

### Filtrage des conditions (`matcher.ts`)

Evalue le `when` declaratif :
- `undefined` → toujours vrai
- Forme objet → toutes les conditions AND
- Forme tableau → au moins une condition OR

Operateurs : `equals`, `contains` (substring), `matches` (regex), `gt`, `lt`, `exists`, `not`.

Resolution de chemin : `"signal.content"` → strip prefix → dot-path lookup dans le payload.

### Scheduler et Performances (`scheduler.ts`)

Chaque match cree une `Performance` (instance d'execution) :

```
Performance
  └─ StepCursor
       ├─ step 1: move   (animated: start → update(progress) → complete)
       ├─ step 2: flash  (animated: start → update(progress) → complete)
       ├─ step 3: spawn  (instant: execute)
       └─ step 4: wait   (pure timing, pas de commande)
```

**Actions animees** (avec `duration`) : `onActionStart()` au debut, `onActionUpdate(progress)` chaque frame, `onActionComplete()` a la fin.

**Actions instantanees** : `onActionExecute()` immediatement, curseur avance.

**Actions structurelles** : `parallel` (fan-out), `onArrive` (continuation), `onInterrupt` (extraites au lancement, executees uniquement sur interruption).

### Resolution d'entite (`resolver.ts`)

```
entityRef (ex: "agent", "signal.from")
  → resolveEntityRef(ref, signal)
  → si "signal.*" : lookup dans signal.payload
  → sinon : retourne le ref tel quel (semantic ID)
```

`resolveParams(params, signal)` : remplace toutes les valeurs `"signal.*"` dans les params.

---

## Etape 5 — RunModeSink — commandes vers le rendu (Track A)

**Fichier** : `run-mode/run-mode-sink.ts`

Implemente `CommandSink` de `@sajou/core`. Pont entre les commandes abstraites et les objets Three.js.

### Chaine de resolution d'entite

```
entityRef (semantic: "peon")
  → resolveEntityId(semanticId)   // cherche dans getSceneState().entities
  → PlacedEntity.id (instance: "peon-01")
  → adapter.getHandle(placedId)
  → DisplayObjectHandle (Three.js mesh wrapper)
```

### Actions implementees

| Commande | Action |
|----------|--------|
| `onActionUpdate` | `move` : `handle.x/y = lerp(start, target, progress)` |
| `onActionUpdate` | `fly` : move + `sin(progress*PI)` arc en hauteur |
| `onActionUpdate` | `flash` : blend tint aller-retour |
| `onActionUpdate` | `followRoute` : interpolation le long d'un polyline |
| `onActionComplete` | `move`/`fly` : snap + `switchAnimation(animationOnArrival)` |
| `onActionExecute` | `spawn` : `handle.visible = true` + teleport |
| `onActionExecute` | `destroy` : `handle.visible = false` |
| `onActionExecute` | `setAnimation` : `switchAnimation(state)` |

---

## Etape 6 — BindingExecutor — assignations directes (Track B)

**Fichier** : `run-mode/run-mode-bindings.ts`

Pour chaque signal recu :

```typescript
handleSignal(signal) {
  for (const choreo of choreographies) {
    const bindings = getBindingsFromChoreography(choreo.id);
    if (bindings.length === 0) continue;

    const info = getChoreoInputInfo(choreo.id);
    if (!info.effectiveTypes.includes(signal.type)) continue;

    if (!matchesWhen(choreo.when, signal)) continue;

    for (const binding of bindings) {
      executeBinding(binding, signal, adapter);
    }
  }
}
```

### Extraction de valeur (4 strategies en cascade)

1. `binding.sourceField` explicite → `payload[sourceField]`
2. Nom de la propriete comme chemin → `payload[lastSegment]`
3. Convention `payload.value`
4. Premier champ numerique du payload

### Chemin temporel (transitions)

Si `binding.transition` est defini et la propriete est un float :

```
startTransition()
  → snapshot la valeur courante comme fromValue
  → queue une ActivePropertyAnim
  → boucle rAF : tickAnims()
    → elapsed / durationMs → t
    → easingFn(t) → progress
    → handle.prop = lerp(fromValue, targetValue, progress)
    → a la fin : optionnel revert vers la valeur snapshot originale
```

Easings disponibles : `linear`, `easeIn`, `easeOut`, `easeInOut`, `arc`.

### Chemin instantane

| Propriete | Action |
|-----------|--------|
| `animation.state` | `switchAnimation(placedId, animState)` |
| `visible` | toggle `handle.visible` |
| `opacity` | `handle.alpha = mappedValue` |
| `rotation` | `handle.rotation = mappedValue` |
| `scale` | `handle.scale.set(mappedValue)` |
| `position.x/y` | `handle.x/y = mappedValue` |
| `teleportTo` | `resolvePosition(waypoint)` → `handle.x/y` |
| `moveTo` | idem teleportTo |
| `followRoute` | route resolution + path follow |

### Mapping optionnel (`BindingMapping`)

```typescript
interface BindingMapping {
  inputRange: [number, number];
  outputRange: [number, number];
  fn: "lerp" | "clamp" | "step" | "smoothstep";
}
```

---

## Etape 7 — Creation des bindings (UI)

**Fichier** : `workspace/binding-drop-menu.ts`

Les bindings sont crees par **drag & drop** : on tire depuis un noeud choregraphie vers une entite sur le canvas.

### Menu radial

`showBindingDropMenu()` → `showRadialMenu()` affiche les proprietes disponibles autour du point de drop :

1. **Actions topologiques** (si l'entite a des routes/waypoints) : `followRoute`, `teleportTo`, `moveTo`
2. **Etats d'animation** (depuis le spritesheet) : `idle`, `walk`, `attack`...
3. **Proprietes spatiales** : `position.x`, `position.y`, `rotation`, `scale`
4. **Proprietes visuelles** : `opacity`, `visible`

### Deux chemins selon le type

- **Proprietes float** (`scale`, `opacity`, `rotation`, `position.x/y`) : ouvre un popup de configuration temporelle (target value, duration, easing, revert)
- **Proprietes non-float** : cree le binding immediatement via `addBinding()`

---

## Modele de donnees

### ChoreographyDef (format editeur)

```typescript
interface ChoreographyDef {
  id: string;
  on: string;                      // signal type declencheur
  when?: WhenClauseDef;            // conditions de filtrage
  interrupts: boolean;
  defaultTargetEntityId?: string;  // entity cible par defaut
  steps: ChoreographyStepDef[];
  collapsed: boolean;
  // ... nodeX, nodeY (layout editeur)
}
```

### EntityBinding

```typescript
interface EntityBinding {
  id: string;
  targetEntityId: string;          // semanticId de l'entite cible
  property: string;                // "rotation", "animation.state", "opacity"...
  sourceChoreographyId: string;    // quelle choregraphie declenche
  sourceType: BindingValueType;    // "float" | "bool" | "enum" | "event"...
  mapping?: BindingMapping;
  action?: BindingAction;          // pour actions topologiques et animations
  sourceField?: string;            // champ payload explicite
  transition?: BindingTransition;  // config animation temporelle
}
```

### WhenClauseDef (conditions de filtrage)

```typescript
type WhenClauseDef = WhenConditionDef | WhenConditionDef[];
type WhenConditionDef = Record<string, WhenOperatorDef>;

interface WhenOperatorDef {
  equals?: unknown;
  contains?: string;
  matches?: string;   // regex
  gt?: number;
  lt?: number;
  exists?: boolean;
  not?: WhenOperatorDef;
}
```

Forme objet = AND (toutes les conditions doivent matcher).
Forme tableau = OR (au moins une condition doit matcher).

---

## Representation visuelle dans le scene-builder

### Structure de la chaine de blocs

```
┌─ on [task ▼]  ▼ ✖ ───────────────────┐   hat block (trigger)
│                                        │
│  target  [adam-idle-48x48 ×]           │   detail panel
│  interrupts  ☐                         │   (visible quand selectionne)
│                                        │
├─ ◧ filter  always ───────────────────┤   C-shape head (conditions)
│  ├─ → move  agent  800ms  easeInOut  ─┤   steps dans la machoire
│  ├─ ⚡ flash  #E8A851  300ms ─────────┤
│  └─ + ────────────────────────────────┤   drop zone
└───────────────────────────────────────┘   C-shape foot
```

### Correspondance visuelle ↔ data model

| Element visuel | Champ du modele |
|----------------|-----------------|
| Hat : `on [task ▼]` | `ChoreographyDef.on` |
| Detail : `target` badge | `ChoreographyDef.defaultTargetEntityId` |
| Detail : `interrupts` checkbox | `ChoreographyDef.interrupts` |
| C-shape : `filter always` | `ChoreographyDef.when` (absent = always) |
| C-shape : `filter content contains hello` | `ChoreographyDef.when = { content: { contains: "hello" } }` |
| Steps dans la machoire | `ChoreographyDef.steps[]` |
| Wires visuels (source → hat) | `WireConnection[]` dans wiring-state |

### Wiring visuel

Les wires sont dessines dans `workspace/wiring-overlay.ts` comme des courbes SVG :

```
[Source chip]  ──curve──>  [Signal Type chip]  ──curve──>  [Hat block]
                                                              │
                                              drag & drop ────┘──> [Entity on canvas]
                                              creates EntityBinding
```

Le drag depuis le hat (ou le noeud choregraphie) vers une entite ouvre le menu radial
de binding. C'est le pont entre Track A/B et l'entite cible.

---

## Interconnections cles

- **Le wiring gouverne le routage** : `getChoreoInputInfo()` est appele a la fois dans la gate du controller et dans `BindingExecutor.handleSignal()`. Le graphe de wires est autoritaire quand il existe.

- **Les bindings sont lus paresseusement** : `getBindingsFromChoreography()` est appele a chaque signal. Les bindings ajoutes pendant le run mode sont immediatement effectifs sans redemarrage.

- **`semanticId` est l'identite d'acteur** : c'est le lien entre `step.entity`, `EntityBinding.targetEntityId`, et le lookup `resolveEntityId()`. Les entites sans `semanticId` sont du decor passif.

- **Snapshot/restore** : `startRunMode()` sauvegarde l'etat ; `stopRunMode()` le restaure. Le mecanisme `BindingTransition.revert` utilise aussi le snapshot pour connaitre la valeur "originale".

- **Correlation de signal** : `correlationId` thread depuis l'enveloppe du signal jusqu'au choreographer pour le scope des interruptions.

---

## Fichiers de reference

| Fichier | Role |
|---------|------|
| `simulator/signal-connection.ts` | Transports, parsing, `dispatchSignal()` |
| `state/signal-source-state.ts` | Gestion des sources |
| `state/wiring-state.ts` | Definitions des wires |
| `state/wiring-queries.ts` | `getChoreoInputInfo()`, `getSourcesForChoreo()` |
| `state/binding-store.ts` | Store des `EntityBinding` |
| `run-mode/run-mode-controller.ts` | Lifecycle run mode, gate, dispatch dual-track |
| `run-mode/run-mode-sink.ts` | `CommandSink` impl (commandes → Three.js) |
| `run-mode/run-mode-bindings.ts` | `BindingExecutor` + animation temporelle |
| `workspace/binding-drop-menu.ts` | UI creation de bindings (menu radial) |
| `workspace/wiring-overlay.ts` | Rendu visuel des wires |
| `views/step-chain.ts` | Rendu de la chaine de blocs |
| `views/filter-block.ts` | C-shape filter (conditions `when`) |
| `views/rack-renderer.ts` | Orchestration rendu rack + detail |
| `packages/core/src/choreographer/` | Runtime: Choreographer, Scheduler, Matcher, Resolver |
