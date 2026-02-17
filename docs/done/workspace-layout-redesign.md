# Workspace Layout Redesign
Tiers: interface
---

Repenser le layout du workspace pour maximiser l'espace tout en préservant la lisibilité du pipeline et les connexions visuelles entre zones.

## Contexte

Le layout actuel (3 colonnes fixes + rideau) pose problème :
- Les zones Signal et Choreographer sont trop petites pour être utiles en permanence
- La zone Theme manque d'espace pour le canvas + le shader editor
- L'ajout du shader editor comme 4e zone aggrave le problème
- Le rideau aide mais c'est du partage de misère

Deux approches candidates évaluées ci-dessous.

---

## Approche A — Focus + PiP libre

### Principe
Une zone active prend tout l'espace. Les autres sont des overlays flottants (PiP) ou des icônes dans une dock strip.

### Layout
```
┌──────────────────────────────────────────────────────┐
│ [Sg] [Ch] [Vs] [Sh]                     Dock strip   │
├──────────────────────────────────────────────────────┤
│                                                      │
│              ZONE ACTIVE (full)                      │
│                                                      │
│                                    ┌────────┐        │
│                                    │ PiP    │        │
│                                    └────────┘        │
│  ┌────────┐                                          │
│  │ PiP    │                                          │
│  └────────┘                                          │
└──────────────────────────────────────────────────────┘
```

### 3 états par zone
- **Full** — occupe tout le workspace (1 seule)
- **PiP** — overlay flottant, draggable, resizable (0–2)
- **Docked** — icône dans la strip (clic = full, drag = PiP)

### Forces
- Espace maximal pour la zone active
- Flexible : chaque utilisateur arrange ses PiP comme il veut
- Le shader s'intègre naturellement comme 4e zone

### Faiblesses
- **Les wires entre zones perdent leur ancrage visuel** — quand les zones sont des overlays libres, la métaphore de pipeline (signal → choreo → visual) est cassée
- Les PiP flottants peuvent se chevaucher, se perdre derrière des panels
- Le wiring drag-to-connect entre PiP est moins lisible qu'entre zones alignées
- Pas de représentation spatiale du flux de données

---

## Approche B — Pipeline rail + zones extensibles

### Principe
Les zones sont des **nœuds dans un pipeline visuel** (comme le choreo canvas, mais un niveau au-dessus). Le pipeline rail reste toujours visible et montre les connexions. Chaque nœud peut être compact ou étendu.

### Layout — état par défaut (compact rail + 1 zone étendue)
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌────────┐   ┌────────┐                             │
│  │ Signal │──▶│ Choreo │──▶┐                         │
│  │ (mini) │   │ (mini) │   │                         │
│  └────────┘   └────────┘   │                         │
│                            ▼                         │
│               ┌─────────────────────────────────┐    │
│               │                                 │    │
│               │       Visual (étendu)           │    │
│               │                                 │    │
│               │                                 │    │
│               └─────────────────────────────────┘    │
│                            │                         │
│                            ▼                         │
│                       ┌────────┐                     │
│                       │ Shader │                     │
│                       │ (mini) │                     │
│                       └────────┘                     │
└──────────────────────────────────────────────────────┘
```

### Layout — état "je wire signal → choreo"
```
┌──────────────────────────────────────────────────────┐
│  ┌──────────────────┐   ┌──────────────────┐         │
│  │                  │──▶│                  │──▶┐     │
│  │  Signal (étendu) │   │  Choreo (étendu) │   │     │
│  │  logs + sources  │   │  node canvas     │   │     │
│  │                  │   │                  │   │     │
│  └──────────────────┘   └──────────────────┘   │     │
│                                                ▼     │
│                                          ┌────────┐  │
│                                          │ Visual │  │
│                                          │ (mini) │  │
│                                          └────────┘  │
└──────────────────────────────────────────────────────┘
```

### Mécanique
Chaque zone (nœud) a 3 tailles :
- **Mini** (~120×80px) : label + live thumbnail, les wires y sont connectés
- **Medium** (~300×200px) : contenu interactif réduit (logs scrollables, mini canvas)
- **Extended** : prend l'espace restant (1–2 zones max en extended)

Le **rail** (les flèches ──▶) est toujours dessiné. C'est le squelette visuel du pipeline :
```
Signal ──▶ Choreo ──▶ Visual
                        │
                        ▼
                      Shader
```

### Interactions
- **Clic sur un nœud mini** → il passe en extended, les autres se compressent
- **Double-clic** → le nœud prend tout l'espace (mode focus), les autres passent en mini sur un rail compact en haut
- **Drag un wire** depuis un port sur un nœud → le nœud cible s'étend automatiquement pour recevoir le drop
- **Scroll/zoom** dans un nœud medium → il passe en extended automatiquement
- **Raccourcis** : 1=Signal, 2=Choreo, 3=Visual, 4=Shader (comme Blender)

### Les wires — bidirectionnels
Les wires du pipeline sont les mêmes que les connector bars actuelles, mais dessinés entre les nœuds :
- Signal → Choreo : quels signal types alimentent quels choreos
- Choreo → Visual : quels choreos pilotent quels acteurs
- Choreo → Shader : (futur) quels choreos pilotent quels uniforms

Les wires sont visibles **même quand les nœuds sont en mini**. C'est la carte du pipeline.

#### Feedback bidirectionnel (à venir)

Le pipeline n'est pas un DAG unidirectionnel. Le feedback introduit des flux retour :

```
         ┌──────────────────────────────────┐
         │          feedback                │
         ▼                                  │
      Signal ──▶ Choreo ──▶ Visual ──▶ Shader
         ▲          ▲          │          │
         │          └──────────┘          │
         │          user.* events         │
         └────────────────────────────────┘
                  shader output
```

Cas concrets :
- **user.click / user.hover** : l'utilisateur clique sur un acteur dans Visual → signal retour vers Choreo → peut déclencher une choreo ou notifier Signal (remonter à l'agent)
- **Shader → Signal** : un seuil atteint dans le shader (ex: réaction-diffusion converge) → génère un signal retour
- **Visual → Choreo** : un acteur arrive à destination → déclenche `onArrive` → Choreo envoie la suite

**Impact sur le rail :** les nœuds ont des **ports d'entrée ET de sortie** des deux côtés. Les wires retour sont dessinés avec un style distinct (pointillés, couleur atténuée, ou courbe de retour en dessous du rail). On ne mélange pas visuellement forward et feedback.

**Impact sur le layout :** le rail linéaire reste lisible pour le flux principal. Les wires de feedback passent "en dessous" ou sur un layer SVG séparé. Quand un nœud est en mini, ses ports feedback sont visibles mais plus petits.

**Layout avec feedback visible :**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌────────┐ ──▶ ┌────────┐ ──▶ ┌────────┐           │
│  │ Signal │     │ Choreo │     │ Visual │           │
│  │        │ ◁╌╌ │        │ ◁╌╌ │        │           │
│  └────────┘     └────────┘     └────────┘           │
│                                    │  ▲              │
│                                    ▼  ╎              │
│                               ┌────────┐            │
│                               │ Shader │            │
│                               └────────┘            │
│                                                      │
│  ──▶ = flux forward (plein)                          │
│  ◁╌╌ = flux feedback (pointillé)                     │
└──────────────────────────────────────────────────────┘
```

### Forces
- **Le pipeline est toujours lisible** — on voit d'un coup d'œil le flux signal→choreo→visual→shader
- **Les connexions ont un ancrage spatial stable** — les wires relient des nœuds fixes, pas des overlays flottants
- **L'espace s'adapte au travail** — on étend ce sur quoi on travaille, le reste se compresse
- **Pas de perte de contexte** — les mini-previews montrent l'état live des zones non-actives
- **Le shader s'intègre comme nœud downstream** dans le pipeline (branché sur Visual ou Choreo)
- **Le feedback bidirectionnel s'intègre naturellement** — ports d'entrée/sortie sur les nœuds, wires retour en style distinct, pas besoin de changer la structure du layout

### Faiblesses
- Plus complexe à implémenter que le PiP libre
- Le layout auto-flow (qui s'étend, qui se compresse) demande un bon algorithme de répartition
- Les mini-previews nécessitent un rendu à basse résolution pour chaque zone
- Les wires feedback ajoutent de la densité visuelle — nécessite un bon design de styles pour distinguer forward/feedback sans surcharger

---

## Comparaison

| Critère                        | A (PiP libre)  | B (Pipeline rail)  |
|-------------------------------|----------------|-------------------|
| Espace pour la zone active    | ★★★★★          | ★★★★              |
| Visibilité du pipeline        | ★★             | ★★★★★             |
| Wiring entre zones            | ★★             | ★★★★★             |
| Multi-zone simultané          | ★★★★           | ★★★★              |
| Simplicité d'implémentation   | ★★★★           | ★★★               |
| Flexibilité de placement      | ★★★★★          | ★★★               |
| Cohérence avec la vision sajou| ★★★            | ★★★★★             |
| Support feedback bidirectionnel| ★★            | ★★★★★             |

---

## Anti-référence : MadMapper (et le pattern "VJ software")

MadMapper est un outil de projection mapping puissant et bien conçu dans son domaine. Mais son interface illustre exactement ce que sajou **ne doit pas devenir** :

```
┌─ tree ─┬─ preview viewport ──────────────┬─ thumbnails ─┐
│ layers │ surfaces + mapping               │ media grid   │
│ clips  │                                  │ presets      │
│ fx     │                                  │              │
├────────┴──────────────────────────────────┴──────────────┤
│ timeline grid : pistes × blocs colorés                   │
│ automation curves                                        │
├──────────────────────────────────────────────────────────┤
│ properties panel                                         │
└──────────────────────────────────────────────────────────┘
```

### Pourquoi c'est un anti-pattern pour sajou

1. **Pas de flux lisible** — l'information est répartie dans des panneaux autour d'un viewport central. Il faut connaître l'outil pour savoir où regarder. Chez sajou, le pipeline EST l'interface.

2. **Timeline horizontale = clips sur pistes** — c'est le modèle DAW/NLE (Ableton, Premiere). La chorégraphie sajou est un graphe de nœuds déclenchés par des signaux, pas des clips temporels alignés.

3. **Grille de thumbnails/médias** — sajou n'est pas une médiathèque. Les assets vivent dans les entités, pas dans un browser latéral.

4. **Sidebars multi-couches** — tree + properties + presets = beaucoup d'espace pour de la navigation. Chez sajou, l'information circule dans le pipeline, elle ne déborde pas sur les côtés.

5. **Panneau d'automation** — les uniforms et paramètres sajou sont dans les nœuds du pipeline (dans la zone shader ou choreo), pas dans un panneau séparé.

### Ce qu'on en retient (positif)

- Le viewport central prend beaucoup d'espace → approche B offre ça en mode "extended"
- Les surfaces ont des ports visuels pour le mapping → nos nœuds aussi (ports forward + feedback)
- Le code couleur par type de contenu aide la lisibilité → nos wires forward/feedback auront des styles distincts

### Philosophie sajou

> sajou = traitement de signal chorégraphié avec rendu visuel puissant.

L'interface doit **être** le pipeline, pas une collection de panneaux autour d'un viewport. Chaque pixel d'écran montre soit un nœud du flux, soit un wire qui les relie, soit le contenu étendu du nœud sur lequel on travaille.

---

## Décision

**Approche B retenue.** Le pipeline rail est la bonne approche pour sajou — il représente visuellement ce que le produit est, pas juste ce qu'il fait. L'approche A (PiP libre) est écartée car elle casse la métaphore de flux qui est l'identité du produit.
