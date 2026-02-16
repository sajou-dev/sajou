# Mode p5.js dans le shader editor
Tiers: interface
---
Ajouter un mode p5.js comme alternative au GLSL brut dans le shader editor. Le shader node aurait deux modes d'authoring : GLSL (actuel) et p5.js (canvas JavaScript). Le type `ShaderMode` est déjà préparé pour l'extension (`"glsl" | "p5"`). Nécessite un runtime p5 séparé, un éditeur JS, et un pont pour les uniforms/bindings du choreographer.
