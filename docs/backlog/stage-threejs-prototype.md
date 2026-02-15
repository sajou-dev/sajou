# Prototype Stage Three.js
Tiers: interface
---
Board isométrique dans Three.js : OrthographicCamera, planes avec sprites pixel art,
MeshStandardMaterial + normal maps pour le lighting dynamique (PointLight, DirectionalLight).
Spawner une entité, la déplacer sur commande depuis le choreographer.
Le renderer implémente le CommandSink de @sajou/core — pas de bridge, appel direct.
Réf: docs/specs/sajou-stage.md, docs/decisions/choix-threejs-stage.md
