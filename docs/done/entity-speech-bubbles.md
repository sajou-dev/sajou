# Bulles de texte sur les entités
Tiers: interface
---
Ajouter la possibilité d'afficher des bulles de texte (speech bubbles) sur les entités, style cartoon.

Le texte provient de la chorégraphie — une action dédiée (ex: `say`, `bubble`) qui prend un texte ou un champ du signal payload et l'affiche au-dessus de l'entité ciblée, avec apparition/disparition animée.

**Motivation** : le mouvement seul ne suffit pas toujours à expliquer ce que fait un LLM. Une bulle de texte rend l'intention visible — "je cherche dans la base de code", "j'ai trouvé 3 résultats", "j'appelle l'API"…

**Pistes** :
- Rendu Canvas2D overlay (comme les overlays éditeur existants) ou mesh Three.js
- Style cartoon : contour arrondi, petite queue pointant vers l'entité, fond semi-transparent
- Durée configurable, fade in/out
- Taille de bulle adaptative au contenu
- Possibilité de streaming (le texte s'écrit lettre par lettre comme un token stream)

---
Complété: 2026-02-19 — branche `interface/quick-ux-improvements`

**Implémentation** :
- Canvas2D overlay en screen-space (pixel-perfect indépendamment du zoom)
- Binding `speech` dans le radial menu et le binding-store (type `string`)
- Streaming : `text_delta`/`thinking` → `appendSpeechText()` (typewriter lettre par lettre)
- Non-streaming : `setSpeechText()` (remplacement complet)
- Lifecycle : typing → visible → fading → supprimé (auto-dismiss + fade-out)
- Stream boundary : gap > 3s entre deltas → nouveau message
- Configurable par entité : `SpeechBubbleConfig` sur `PlacedEntity` (couleurs, taille, opacité, rétention, position du tail bottom/left/right)
- Section Inspector "Speech Bubble" pour éditer la config (actors seulement)
- 26 tests unitaires dans `speech-bubble-state.test.ts`
