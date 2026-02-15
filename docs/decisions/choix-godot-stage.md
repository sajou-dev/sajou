# Choix de Godot 4 comme moteur du Stage — ABANDONNÉ
Date: 2026-02-15
Statut: Abandonné le 2026-02-15, remplacé par choix-threejs-stage.md
Contexte: Le passage de sajou d'un visualiseur passif à un monde interactif (isométrie, lighting dynamique, particules, input, pathfinding, audio spatial) nécessite un vrai moteur de jeu. Construire ces systèmes from scratch par-dessus Three.js/PixiJS revient à réinventer un game engine.
Décision: Utiliser Godot 4 comme moteur du Stage, exporté en WASM pour le web, communiquant avec @sajou/core via JavaScriptBridge.
Raison de l'abandon: La courbe d'apprentissage de Godot (GDScript, éditeur, pipeline d'export WASM) est incompatible avec la charge de travail actuelle. Le bridge JS ↔ WASM ajoute une couche de complexité que Three.js élimine en restant natif dans l'écosystème web du projet.
