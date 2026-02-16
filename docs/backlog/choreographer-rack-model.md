# Choreographer — modèle rack/slot/carte
Tiers: core + interface
---

## Contexte

Le chorégraphe actuel utilise un canvas de nœuds avec des wires de connexion. À mesure que les chorégraphies se complexifient, les wires deviennent illisibles (spaghetti). Le système de connexion par lignes perd son sens.

## Proposition

Remplacer le canvas de nœuds par un modèle **rack/slot/carte** inspiré de l'automation industrielle et de la robotique modulaire.

### Métaphore

Un **rack** (chassis) avec des emplacements fixes. Des **cartes** (modules) qu'on enfiche dans les slots. La position dans le rack = la connexion. Pas de wires.

### Fonctionnement

- Le signal entrant arrive dans le rack
- Chaque **carte** est un step de la chorégraphie (move, flash, spawn, destroy, typeText, drawBeam...)
- Les cartes s'enfichent dans l'ordre d'exécution — la séquence est implicite par la position physique
- **Cartes carriers** : certaines cartes ont des sous-slots pour accueillir d'autres cartes (ex: `onArrive`, `parallel`, `sequence`, `conditional`)
- **Cartes préfiltre** : se glissent en amont pour filtrer/throttle les signaux entrants (cf. signal-prefilter.md)
- La forme/couleur du slot indique le type de carte compatible

### Interactions

- **Drag & drop** pour insérer, réordonner, déplacer entre racks
- **Clic sur une carte** → déplie ses paramètres (inline, pas dans un panel séparé)
- **Clic sur un carrier** → déplie sa sous-chain de cartes
- **Supprimer** → retirer la carte du slot, les cartes suivantes se décalent
- **Dupliquer** → copie de la carte avec ses paramètres

### Exemple visuel

```
┌─ Rack: "agent-thinking" ──────────────────────────────┐
│                                                        │
│  [Throttle 5/s] → [Move agent→center] → [Flash gold]  │
│                                                        │
│  → [onArrive ─────────────────────────┐               │
│     │  [Spawn particles] → [FadeOut]  │               │
│     └─────────────────────────────────┘               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Hiérarchie

```
Rack (= une chorégraphie complète)
  └─ Slot
      └─ Carte (= un step)
          └─ Paramètres (inline, dépliables)
          └─ Sous-slots (si carrier)
              └─ Cartes enfants
```

### Pourquoi pas des wires

- La position = la connexion. Pas besoin de tracer des lignes.
- Pas de spaghetti, pas de croisements, pas de zoom/pan pour suivre un wire.
- Le flux est lisible d'un coup d'œil : gauche → droite (ou haut → bas).
- Le modèle est physique, tangible — comme un rack de dimmers ou un châssis d'automate.

### Référence

Modèle rack/slot/carte de l'automation industrielle et de la robotique modulaire : chassis avec emplacements fixes, cartes enfichables, carriers contenant des sous-cartes. La forme du slot détermine la compatibilité.

## Status

Backlog — à valider sur prototype avant engagement.
