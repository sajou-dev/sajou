# Périmètre des entrées non-agent (MIDI, shaders, OSC…)
Date: 2026-02-17
Contexte: après implémentation du MIDI input + wiring, constat qu'on risque de dériver vers un outil générique de mapping signal→visuel (type TouchDesigner / MadMapper) au détriment de l'identité du projet.

## Le problème

sajou accumule des capacités d'entrée (WebSocket, SSE, OpenAI, Anthropic, OpenClaw, MIDI) et de sortie (Three.js, shaders, particules, lumières). Prises individuellement, chacune a du sens. Mais l'ensemble commence à ressembler à une station de patching générique.

**Le risque :** si le but c'est juste d'animer un shader avec un knob MIDI, MadMapper + un script Python OSC sera toujours plus léger et plus mature. On ne gagnera jamais sur ce terrain.

## Ce qui fait sajou

La valeur unique de sajou, c'est la **couche chorégraphique déclarative** entre les signaux et le rendu :

- Les choreographies sont du **JSON déclaratif**, pas du code impératif
- Le système de `when` permet du **filtrage sémantique** sur le contenu des signaux (pas juste du mapping numérique)
- Les **performances** sont des séquences temporelles avec easing, parallélisme, interruptions
- Le tout est **composable par des AIs** — un agent peut écrire une choreography, pas un patch TouchDesigner

**sajou n'est pas un outil de VJing. C'est un outil de mise en scène d'agents.**

## Décision

### Les entrées non-agent (MIDI, OSC futur…) sont des **accessoires**, pas le coeur

Elles servent à :
1. **Enrichir les performances live** — un opérateur humain ajoute du feeling par-dessus les choreographies déclenchées par les agents
2. **Prototyper** — tester des bindings visuels sans attendre un vrai flux d'agent
3. **Performances hybrides** — humain + agent collaborent sur la scène

Elles ne servent PAS à :
- Remplacer le choreographer par du mapping direct signal→propriété
- Faire de sajou un outil de VJing générique
- Reproduire TouchDesigner/MadMapper dans le browser

### Priorités de développement

**Le choreographer d'abord.** Tant que le coeur n'est pas solide et agréable à utiliser, ajouter des entrées/sorties c'est de la plomberie sans destination.

Concrètement :
1. **Choreographer UX** — le rack model, l'édition de steps, le when clause builder, le preview
2. **Run mode** — que les performances s'exécutent correctement, que les bindings marchent, que le signal→choreo→rendu soit fluide
3. **Export/import** — qu'on puisse sauvegarder et rejouer une scène complète
4. **Puis seulement** — enrichir les entrées (MIDI avancé, OSC) et sorties (shaders, audio reactif)

### Ce qu'on a déjà et qu'on garde

Le travail MIDI fait sur `core/midi-input` et `interface/shader-editor` est valide :
- Parser, discovery, transport — c'est propre et bien testé
- Signal types + wiring + binding avec sourceField — ça s'intègre dans le système existant sans le tordre
- Les presets de mapping — utiles mais pas critiques

On ne jette rien, mais on arrête d'empiler des features d'entrée tant que le choreographer n'est pas à la hauteur.

## Alternatives envisagées

- **Tout bloquer** — non, le MIDI est déjà fait et bien intégré, pas de raison de le retirer
- **Continuer à fond** — non, on diverge du positionnement ; chaque feature d'entrée ajoutée sans renforcer le coeur dilue le produit
- **Extraire les entrées en plugins** — prématuré, mais bonne direction à terme si le besoin se confirme

## Raison

sajou se distingue par ce qu'aucun autre outil ne fait : des choreographies déclaratives pilotées par la sémantique des agents, composables par des AIs. Si on perd ça de vue, on construit un mauvais TouchDesigner au lieu d'un bon sajou.
