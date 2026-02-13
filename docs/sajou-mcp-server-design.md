# sajou MCP Server — Note de design

> **Statut** : Exploration — pas prêt pour implémentation
> **Date** : 2026-02-13
> **Contexte** : La V2 et l’évolution des interfaces entre les 3 couches sont en cours. Ce document capture le design MCP pour référence future, à revisiter une fois les contraintes inter-couches stabilisées.

-----

## 1. Positionnement

sajou expose un **serveur MCP** (Model Context Protocol). L’agent IA est le client.

L’intelligence reste côté agent. sajou est le théâtre — un runtime déclaratif sans LLM intégré, sans API key, sans latence d’inférence. L’agent qui se connecte est déjà un LLM : il raisonne, il choisit, il compose. sajou rend.

### Ce que ça permet

Un agent IA peut, via MCP :

- Découvrir les thèmes et assets disponibles
- Composer une scène qui le représente visuellement
- Connecter ses événements à des chorégraphies
- Émettre des signaux en temps réel

### Ce que ça ne fait pas

- sajou ne devine pas comment représenter un agent
- sajou ne génère pas d’assets
- sajou n’interprète pas de requêtes en langage naturel

-----

## 2. Package et placement

```
adapters/
└── mcp-server/
    ├── src/
    │   ├── server.ts        # Serveur MCP (stdio + SSE)
    │   ├── tools/           # Un fichier par tool
    │   └── bridge.ts        # Pont vers le Signal Bus du core
    └── package.json
```

MCP est un adaptateur, au même niveau que `adapters/openclaw/`. Il ne touche pas au core. Le bridge traduit les appels MCP en opérations sur le Signal Bus et le registre de chorégraphies existants.

-----

## 3. Catalogue d’assets par thème

Chaque thème expose un catalogue d’objets organisé par catégories. L’agent n’a pas besoin de générer des images ni de comprendre du rendu — il pioche dans un menu.

```json
{
  "theme": "citadel",
  "catalog": {
    "backgrounds": ["forest-clearing", "mountain-pass", "dark-swamp"],
    "buildings": ["town-hall", "barracks", "forge", "gold-mine", "watchtower"],
    "units": ["peon", "footman", "archer", "mage"],
    "effects": ["explosion", "heal-aura", "gold-coins", "smoke"],
    "props": ["torch", "banner", "crate", "campfire"]
  }
}
```

Contrat : **tout ce qui est dans le catalogue est garanti rendable par le thème**. Pas de promesse non tenue.

Exemples de thèmes envisagés :

|Thème          |Univers                       |Ambiance                    |
|---------------|------------------------------|----------------------------|
|`citadel`      |Médiéval-fantasy, WC3-inspired|Campement RTS               |
|`farm`         |Pastoral                      |Animaux, grange, champs     |
|`space-station`|Sci-fi                        |Modules, vaisseaux, drones  |
|`cave`         |Souterrain                    |Cristaux, torches, créatures|

-----

## 4. Placement : système à 3 niveaux

Le problème fondamental : un LLM raisonne bien en sémantique et en relations, mais mal en coordonnées spatiales. Le système de placement est conçu pour exploiter ce que les LLM font bien et protéger de ce qu’ils font mal.

### Niveau 1 — Layout automatique par topologie (défaut)

L’agent décrit un graphe de relations. Le thème le transforme en positions.

```json
{
  "layout": "auto",
  "topology": {
    "coordinator": { "role": "hub" },
    "reviewer": { "role": "satellite", "connected_to": "coordinator" },
    "coder": { "role": "satellite", "connected_to": "coordinator" },
    "database": { "role": "resource", "connected_to": ["coder", "reviewer"] }
  }
}
```

Rôles topologiques standardisés :

|Rôle       |Sémantique                |Placement typique   |
|-----------|--------------------------|--------------------|
|`hub`      |Nœud central, coordinateur|Centre de la scène  |
|`satellite`|Worker, agent secondaire  |Orbite autour du hub|
|`resource` |Stockage, base de données |Périphérie          |
|`bridge`   |Connecteur entre groupes  |Entre les clusters  |
|`observer` |Monitoring, logging       |En retrait, surplomb|

C’est le mode par défaut. Le résultat est garanti lisible et esthétique — le thème contrôle la composition.

### Niveau 2 — Zones sémantiques nommées

L’agent choisit une zone par entité. Le thème gère le placement dans la zone.

```json
{
  "layout": "zones",
  "placements": [
    { "id": "coordinator", "asset": "town-hall", "zone": "command" },
    { "id": "coder", "asset": "forge", "zone": "production" },
    { "id": "scout", "asset": "watchtower", "zone": "perimeter" }
  ]
}
```

Chaque thème définit ses propres zones avec descriptions (le LLM les lit et choisit) :

```json
{
  "zones": {
    "command":    { "description": "Centre de la base, point focal", "capacity": 2 },
    "production": { "description": "Zone de travail, forges et ateliers", "capacity": 4 },
    "perimeter":  { "description": "Bordure défensive, tours et postes de garde", "capacity": 6 },
    "resource":   { "description": "Mines, fermes, sources de matériaux", "capacity": 3 },
    "sacred":     { "description": "Temple, lieu de pouvoir magique", "capacity": 1 }
  }
}
```

### Niveau 3 — Waypoints explicites (avancé)

Le thème expose une carte d’emplacements pré-définis, testés visuellement, garantis esthétiques et non-chevauchants.

```json
{
  "layout": "waypoints",
  "placements": [
    { "id": "coordinator", "asset": "town-hall", "waypoint": "hilltop-01" },
    { "id": "coder", "asset": "forge", "waypoint": "riverside-03" }
  ]
}
```

Catalogue de waypoints exposé via MCP :

```json
{
  "waypoints": [
    { "id": "hilltop-01", "zone": "command", "tags": ["elevated", "central", "visible"] },
    { "id": "riverside-03", "zone": "production", "tags": ["water", "industrial", "south"] }
  ]
}
```

Les tags permettent au LLM de raisonner sémantiquement : une forge → waypoint tagué `industrial`.

### Récapitulatif

|Niveau   |L’agent décrit                    |Le thème décide      |Cas d’usage               |
|---------|----------------------------------|---------------------|--------------------------|
|Auto     |Topologie (hub/satellite/resource)|Tout le placement    |Agent simple, setup rapide|
|Zones    |Zone sémantique par entité        |Position dans la zone|Contrôle thématique       |
|Waypoints|Emplacement nommé précis          |Rendu et routes      |Scène composée finement   |

Principe : **le thème a toujours le dernier mot sur le rendu spatial.**

-----

## 5. Routes entre entités

L’agent déclare les connexions. Le thème décide du tracé visuel.

```json
{
  "routes": [
    { "from": "coordinator", "to": "coder", "type": "task" },
    { "from": "coder", "to": "coordinator", "type": "result" },
    { "from": "coder", "to": "database", "type": "query" }
  ]
}
```

Le `type` influence le rendu — un `task` pourrait être un chemin principal large, un `query` un sentier secondaire. L’agent ne dessine jamais de bézier. Il dit “A parle à B”.

Types de routes standardisés :

|Type     |Sémantique            |
|---------|----------------------|
|`task`   |Assignation de travail|
|`result` |Retour de résultat    |
|`query`  |Requête de données    |
|`event`  |Notification, signal  |
|`control`|Commande de contrôle  |

-----

## 6. MCP Tools — Workflow complet

### Phase 1 — Discovery

|Tool                |Description                   |Retour                                       |
|--------------------|------------------------------|---------------------------------------------|
|`list_themes`       |Thèmes disponibles            |`["citadel", "farm", "space-station"]`       |
|`get_catalog`       |Catalogue d’assets d’un thème |backgrounds, buildings, units, effects, props|
|`get_zones`         |Zones sémantiques d’un thème  |zones avec descriptions et capacités         |
|`get_waypoints`     |Emplacements nommés d’un thème|waypoints avec tags                          |
|`get_choreographies`|Chorégraphies disponibles     |liste avec descriptions et signaux attendus  |

### Phase 2 — Configuration de scène

|Tool            |Description                     |Input                        |
|----------------|--------------------------------|-----------------------------|
|`register_agent`|L’agent se déclare              |id, name, description        |
|`compose_scene` |Place les entités               |layout level + placements    |
|`declare_routes`|Connexions entre entités        |from/to/type                 |
|`map_signals`   |Mappe événements → chorégraphies|signal_type → choreography_id|

### Phase 3 — Runtime

|Tool             |Description       |Input                  |
|-----------------|------------------|-----------------------|
|`emit_signal`    |Envoyer un signal |type, from, to, payload|
|`get_scene_state`|Inspecter la scène|—                      |

### Exemple de session MCP complète

```
Agent → list_themes()
Agent ← ["citadel", "farm"]

Agent → get_catalog("citadel")
Agent ← { buildings: [...], units: [...], ... }

Agent → register_agent({ id: "code-review-crew", name: "Code Review Agent" })
Agent ← { ok: true }

Agent → compose_scene({
  theme: "citadel",
  layout: "auto",
  topology: {
    "orchestrator": { role: "hub", asset: "town-hall" },
    "reviewer-1":   { role: "satellite", connected_to: "orchestrator", asset: "watchtower" },
    "reviewer-2":   { role: "satellite", connected_to: "orchestrator", asset: "watchtower" },
    "code-db":      { role: "resource", connected_to: ["reviewer-1", "reviewer-2"], asset: "gold-mine" }
  }
})
Agent ← { scene_id: "sc_01", status: "composed" }

Agent → declare_routes({
  routes: [
    { from: "orchestrator", to: "reviewer-1", type: "task" },
    { from: "orchestrator", to: "reviewer-2", type: "task" },
    { from: "reviewer-1", to: "orchestrator", type: "result" },
    { from: "reviewer-2", to: "orchestrator", type: "result" },
    { from: "reviewer-1", to: "code-db", type: "query" },
    { from: "reviewer-2", to: "code-db", type: "query" }
  ]
})
Agent ← { ok: true }

Agent → map_signals({
  mappings: [
    { signal: "task_dispatch", choreography: "citadel:pigeon-delivery" },
    { signal: "review_complete", choreography: "citadel:forge-flash" },
    { signal: "error", choreography: "citadel:explosion" }
  ]
})
Agent ← { ok: true }

Agent → emit_signal({ type: "task_dispatch", from: "orchestrator", to: "reviewer-1", payload: { file: "main.py" } })
Agent ← { signal_id: "sig_01", choreography_triggered: "citadel:pigeon-delivery" }
```

-----

## 7. Contrat thème pour compatibilité MCP

Pour qu’un thème soit MCP-compatible, il doit exposer :

```typescript
interface McpCompatibleTheme {
  // Catalogue
  catalog: ThemeCatalog;          // assets par catégorie
  zones: Record<string, Zone>;    // zones sémantiques avec descriptions
  waypoints: Waypoint[];          // emplacements nommés avec tags

  // Layout
  autoLayout(topology: Topology): SceneLayout;   // résout les positions
  zoneLayout(placements: ZonePlacement[]): SceneLayout;
  waypointLayout(placements: WaypointPlacement[]): SceneLayout;

  // Routes
  traceRoutes(routes: Route[], layout: SceneLayout): VisualRoutes;
}
```

Ce contrat s’ajouterait dans `packages/theme-api/`.

-----

## 8. Dépendances sur la V2

> ⚠️ **Ce design dépend de la stabilisation des interfaces inter-couches en V2.**

Points de contact identifiés :

- **Signal Bus** — le bridge MCP doit pouvoir injecter des signaux. Le protocole de signal V2 doit être finalisé.
- **Registre de chorégraphies** — `map_signals` a besoin de requêter et référencer les chorégraphies. L’API du choreographer doit exposer ce registre.
- **Theme API** — `get_catalog`, `get_zones`, `get_waypoints` nécessitent que le thème expose ces structures. Le contrat theme-api doit les inclure.
- **Composition de scène** — `compose_scene` crée un état de scène. La question de comment le choreographer gère des scènes dynamiques (créées à la volée vs pré-définies) est ouverte.

L’implémentation MCP ne devrait commencer qu’une fois ces interfaces stabilisées. Sinon on construit un adaptateur sur du sable mouvant.

-----

## 9. Piste future — Pipeline de création de thèmes

Idée notée pour exploration ultérieure : utiliser ComfyUI (ou un workflow similaire) pour faciliter la création de thèmes complets respectant les contraintes sajou. Un pipeline de génération d’assets avec les specs intégrées (formats d’export, spritesheets, metadata JSON de catalogue) pourrait considérablement accélérer la production de thèmes.

Cela reste hors scope de cette note.

-----

## 10. Transports MCP

|Transport|Cas d’usage                |Notes                                |
|---------|---------------------------|-------------------------------------|
|**stdio**|Dev local, Claude Code, CLI|L’agent lance sajou en process enfant|
|**SSE**  |App web, agents distants   |sajou tourne comme serveur HTTP      |

Les deux transports doivent être supportés. stdio pour le dev et l’intégration locale, SSE pour le déploiement.