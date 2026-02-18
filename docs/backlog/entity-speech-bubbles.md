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
