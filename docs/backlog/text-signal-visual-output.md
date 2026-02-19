# Texte comme source visuelle (bulles, panneaux, shaders, p5)
Tiers: interface
---
Permettre de recevoir du texte via les signaux (`text_delta`, `completion`) et de le router vers les sorties visuelles du scene-builder.

## Cas d'usage
- Bulles de dialogue style BD sur les entités (personnages qui "parlent")
- Panneaux d'information contre les murs de la scène
- Texte comme texture d'entrée pour les shaders (rendu Canvas2D → iChannel)
- Texte comme paramètre p5.js (`p.sajou.text`)
- Effet typewriter (streaming token par token)

## Architecture envisagée

### 1. Accumulateur de texte (choreographer)
Les `text_delta` arrivent token par token. Un buffer dans le choreographer reconstruit le texte complet. Expose :
- `text.full` — texte accumulé complet
- `text.delta` — dernier delta reçu
- `text.length` — longueur (utilisable comme valeur numérique pour les bindings existants)

### 2. Binding string
Étendre le système de binding pour supporter des propriétés texte (pas juste des floats). Wire : `text_delta → entity.speech` ou `text_delta → p5:sketch:text`.

### 3. Rendus visuels
- **p5.js** : `p.sajou.text` comme param string, le sketch décide du rendu
- **Shader** : render texte sur Canvas2D offscreen → upload comme texture sampler2D
- **Entités** : propriété `speech` sur entités existantes → bulle Canvas2D overlay positionnée relativement, ou nouveau type d'entité `text-panel` pour les panneaux muraux

## Idées liées
- ~~`docs/backlog/entity-speech-bubbles.md`~~ → **done** (`docs/done/entity-speech-bubbles.md`) — bulles speech implémentées avec binding `speech`, streaming typewriter, config visuelle par entité
- Filtrage par source : montrer le texte d'un agent spécifique sur une entité spécifique

## État partiel (2026-02-19)
- **Fait** : bulles de dialogue sur entités (binding `speech`, streaming, config visuelle), binding string type
- **Reste** : texte comme texture shader (Canvas2D → iChannel), texte comme param p5.js (`p.sajou.text`), panneaux d'information muraux
