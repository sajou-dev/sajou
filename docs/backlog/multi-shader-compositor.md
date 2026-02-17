# Composition multi-shader
Tiers: interface
---
Permettre d'exécuter plusieurs shaders simultanément et de composer leurs sorties. Chaque shader rend dans son propre RenderTarget, un pass final les combine via des blend modes (add, multiply, screen, alpha over). Le mécanisme de render targets existe déjà pour le ping-pong multi-pass — à étendre pour le multi-shader. Implique un mini-graphe de composition dans le shader node.
