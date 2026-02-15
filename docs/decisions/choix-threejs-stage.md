# Choix de Three.js comme moteur du Stage
Date: 2026-02-15
Contexte: Godot 4 avait été retenu pour le Stage (voir choix-godot-stage.md) mais la courbe d'apprentissage GDScript + l'overhead du bridge WASM sont incompatibles avec les contraintes du projet. Il faut un moteur 3D/2D qui reste dans l'écosystème web natif (npm, Vite, TypeScript).
Décision: Utiliser Three.js comme moteur de rendu du Stage. Sprites pixel art sur des planes avec MeshStandardMaterial + normal maps pour le lighting dynamique. OrthographicCamera pour la projection isométrique.
Alternatives envisagées: Godot 4 (abandonné — courbe d'apprentissage, bridge WASM), PixiJS v8 (pas de lighting natif avec normal maps, pas de vrai 3D pour la profondeur), Babylon.js (plus lourd, API moins ergonomique pour du 2D)
Raison: Three.js élimine le bridge WASM — le choreographer appelle le renderer directement en TypeScript. Le lighting avec normal maps est natif (MeshStandardMaterial). Le Raycaster couvre l'input. L'écosystème npm est vaste (pathfinding.js pour la navigation, three-nebula ou shaders custom pour les particules). Le projet reste 100% TypeScript, testable avec Vitest, servable avec Vite.
