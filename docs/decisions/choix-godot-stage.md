# Choix de Godot 4 comme moteur du Stage
Date: 2026-02-15
Contexte: Le passage de sajou d'un visualiseur passif à un monde interactif (isométrie, lighting dynamique, particules, input, pathfinding, audio spatial) nécessite un vrai moteur de jeu. Construire ces systèmes from scratch par-dessus Three.js/PixiJS revient à réinventer un game engine.
Décision: Utiliser Godot 4 comme moteur du Stage, exporté en WASM pour le web, communiquant avec @sajou/core via JavaScriptBridge.
Alternatives envisagées: Three.js (renderer seul, tout à construire), PixiJS (2D seul, pas de lighting natif ni pathfinding), Phaser (moins flexible pour l'export WASM, communauté plus petite), Bevy (Rust, courbe d'apprentissage, écosystème web immature)
Raison: Godot offre nativement tout ce dont le Stage a besoin (TileMap iso, Y-sort, PointLight2D + normal maps, GPUParticles2D, NavigationAgent2D, AudioStreamPlayer2D, système d'input complet) plus un éditeur visuel pour la création de scènes. L'export WASM est mature. Le bridge JS est documenté. Le coût est le poids WASM (~25-30 MB) — acceptable pour une app web avec cache.
