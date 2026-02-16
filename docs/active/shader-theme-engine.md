# Shader Theme Engine

## Contexte

La piste ComfyUI + ControlNet pour générer des thèmes visuels s'est avérée désastreuse (incohérence entre assets, pas de consistance visuelle).

## Proposition

Remplacer l'approche "pack de PNGs" par une architecture **shaders + SVG paramétrique** :

- Un thème = 3 fichiers JSON : entités (SVG), chorégraphies, shaders
- Le "look" vient des shaders et du post-processing, pas des assets raster
- Composable, versionnable, générable par une IA

## Architecture à deux éditeurs

- **Scene Builder** (existant, Three.js) → composition spatiale, placement de sprites, preview des chorégraphies
- **Shader Editor** (nouveau, Three.js) → édition visuelle de la couche style/rendu, paramètres en temps réel
- Même runtime Three.js, même pipeline

## Inspirations artistiques

### Datamoshing / Glitch art
- Rosa Menkman, Sabato Visconti
- Les erreurs visuelles comme langage — mapping naturel vers les états d'erreur d'un agent

### Generative typography
- Zach Lieberman (openFrameworks), Raven Kwok
- Le texte qui vit, se déforme, respire — les tokens d'un LLM qui deviennent matière

### Réaction-diffusion
- Karl Sims, simulations biologiques
- Un agent qui "pense" = pattern qui évolue, se stabilise quand la réponse arrive

### Noir et lumière (théâtre)
- Ryoji Ikeda — data brute transformée en cathédrale visuelle
- Faisceaux, gobos, hazes numériques — ADN de la direction technique

### Liquid / fluides
- Felix Turner, David Li (WebGL fluids)
- Les signaux comme flux, les agents comme courants qui se croisent

## Direction recommandée

Mix **Ryoji Ikeda + réaction-diffusion** : les données sont froides, précises, graphiques. Quand l'agent "pense", ça devient organique, vivant, imprévisible. Le contraste entre la machine et l'émergence — l'IA c'est du calcul qui produit de l'inattendu. Le shader incarne ça.

## Deux modes d'édition

L'éditeur shader doit supporter deux modes, switchables :

### Mode GLSL
- Éditeur de code GLSL en panel (type CodeMirror/Monaco)
- Écriture directe de vertex/fragment shaders
- Preview temps réel, uniforms exposés comme sliders/pickers
- Pour les devs shader / contrôle fin

### Mode p5.js / Three.js (scripté)
- Éditeur de code JS avec accès à l'API p5.js ou Three.js
- Le langage naturel du generative art (Zach Lieberman, creative coding community)
- Permet de porter directement des sketches existants (OpenProcessing, ShaderToy adaptés, etc.)
- Plus accessible pour les artistes visuels

### Compatibilité
- Les deux modes produisent le même format de sortie (shader theme JSON)
- Le mode p5.js/Three.js compile vers des shaders ou tourne dans un runtime sandbox
- À investiguer : est-ce qu'un mode wrapping (p5 → ShaderMaterial) est viable sans trop de compromis de performance ?

## Status

Backlog — à spécifier avant implémentation.
