# Remarques — chapitres Lumieres et Particules
Date: 2026-02-16

## Ce qui a ete fait

### Lighting
- Ambient light (color + intensity)
- Directional light (color, intensity, angle/elevation en coordonnees spheriques)
- Point lights (position, color, intensity, range, height, flicker)
- Flicker : double sine wave (frequence rapide + lente), modulable par amplitude
- Outil Light (L) : clic → creer, select, drag, delete — undo complet
- Panel : Canvas2D angle/elevation dials, color pickers, sliders, flicker toggle
- Overlay : icone soleil (directional), cercles (point lights), indicateurs d'angle et de range
- Export/import preservent le lighting state, retrocompatible (fallback `createDefaultLighting()`)

### Particles
- Emetteurs radial et directional (17° spread cone)
- THREE.Points + BufferGeometry, simulation CPU (age, lifetime, position, velocity)
- Color-over-life (gradient multi-stops, interpolation lineaire)
- Taille degressif (fade out), glow (AdditiveBlending)
- Outil Particle (K) : clic → creer preset, select, drag, delete — undo complet
- Panel : type radio, count, lifetime, velocity, direction compass dial, color stops (4 max), size, glow
- Overlay : losanges, fleches de direction, cercles pointilles d'etendue
- Preview mode : meme simulation CPU dans la boucle preview
- Export/import preservent les emitters, retrocompatible (`?? []`)

### Pattern architectural commun
- Module state pattern (init/sync/tick/dispose) : light-renderer.ts et particle-renderer.ts
- State diff : compare IDs dans le state vs runtime map → add/update/remove
- Outil pattern (tool) : hit-test → create/select, drag avec snap, keyboard (Delete/Escape)
- Panel pattern : sections avec rows `.sp-row`, Canvas2D dials interactifs, `updateValues()` pour sync
- Canvas2D dial widgets partages entre lighting (angle, elevation) et particles (direction)

## Idees et pistes pour la suite

### Sprite textures pour particules
Le champ `sprite: string` est reserve dans `ParticleEmitterState` mais pas implemente. V2 pourrait charger un asset sprite comme texture du PointsMaterial pour des particules non-circulaires (flammes, etoiles, fumee).

### Gravite et acceleration
La simulation actuelle est velocite constante. Ajouter un champ `gravity: number` et/ou `acceleration: {x, y}` permettrait des trajectoires paraboliques (feu d'artifice, cascades, pluie).

### Emission depuis zone ou entite
Le schema StageParticleSystem prevoit `emitter: "zone:xxx"`. Pas implemente — l'emetteur est toujours un point. Emettre depuis une zone (surface) ou attacher a une entite en mouvement ouvrirait des effets plus riches.

### GPU particle simulation
La simulation CPU tient pour ~500 particules par emetteur. Au-dela, un compute shader (WebGPU) ou un feedback buffer (WebGL2 transform feedback) serait necessaire. Pas urgent en V1.

### Factorisation des dials Canvas2D
Les fonctions `createAngleDial`, `createElevationDial` (lighting-panel) et `createDirectionDial` (particle-panel) partagent ~80% de leur code. Extraire un module `canvas-dial.ts` generique avec un pattern factory (`createDial(config)`) reduirait la duplication. Pas critique mais propre.

### Interaction lumiere-particule
Les particules glow n'interagissent pas avec les lights Three.js (PointsMaterial n'est pas affecte par les lumieres). Pour un rendu plus coherent, on pourrait ajouter des point lights ephemeres aux emetteurs glow, ou passer a MeshBasicMaterial avec des quads individuels.

### Performance du render loop
Le render loop calcule desormais `dt` via `performance.now()`. Les ticks (flicker + particles) sont appeles chaque frame. Si la charge augmente, un fixed timestep (ex: 60Hz) avec accumulation/interpolation serait plus stable qu'un dt variable.

## Questions ouvertes

- Faut-il un "preset library" pour les emetteurs de particules (feu, fumee, pluie, etincelles) directement dans le panel ?
- Le compass dial et les color stops meritent-ils un systeme de "favoris" ou de "templates" reutilisables entre emetteurs ?
- Preview mode reproduit la simulation particules mais pas le flicker des point lights — alignement souhaite ?
