# Architecture thème shader + SVG paramétrique
Tiers: interface
---
Remplacer l'approche "pack de PNGs" par une architecture shaders + SVG paramétrique :
un thème = 3 fichiers JSON (entités SVG, chorégraphies, shaders). Le "look" vient des
shaders et du post-processing, pas des assets raster. Composable, versionnable, générable
par une IA.

## Ce qui reste
- Mode p5.js/Three.js scripté (creative coding accessible)
- Format de sortie unifié "shader theme JSON"
- Packaging d'un thème complet (entités + chorégraphies + shaders)
- Inspirations : Ryoji Ikeda, réaction-diffusion, generative typography, glitch art

Réf: docs/active/shader-theme-engine.md (archivé)
