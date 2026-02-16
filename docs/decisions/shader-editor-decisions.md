# Décisions techniques — Shader Editor
Date: 2026-02-16

## 1. Multi-pass shaders requis en V1

Contexte: Les effets fondamentaux (réaction-diffusion, fluides, feedback) nécessitent un ping-pong framebuffer.
Décision: Implémenter le multi-pass dès la V1 avec deux `WebGLRenderTarget` (swap A↔B).
Alternatives envisagées: Reporter en V2 (trop limitant — les presets phares sont multi-pass).
Raison: Sans multi-pass, le shader editor ne peut pas produire les effets qui justifient son existence.

## 2. Audio reactivity — fichier local V1, signal V2

Contexte: L'audio est un input naturel pour le generative art. Deux sources possibles : fichier importé ou flux live.
Décision: V1 = fichier audio importé (AudioContext + AnalyserNode → FFT uniforms). V2 = connecteur audio comme source signal dans le graphe.
Alternatives envisagées: Tout en V1 (trop de scope), tout en V2 (perd un use case majeur du shader editor).
Raison: Le fichier importé est autonome (pas de dépendance au signal bus), implémentable rapidement, et couvre le cas principal (composition audiovisuelle locale).

## 3. Sandbox iframe pour le mode Script

Contexte: Le code JS utilisateur (p5.js) tourne dans le navigateur. Risque d'accès au DOM parent, au localStorage, aux données sensibles.
Décision: `<iframe sandbox="allow-scripts">` avec communication `postMessage` pour le transfert bitmap.
Alternatives envisagées: Web Worker (pas d'accès Canvas2D), même contexte (pas d'isolation), Shadow Realm (pas encore standardisé).
Raison: L'iframe sandbox offre le meilleur rapport isolation/accès API. Le Canvas2D est disponible dans l'iframe, le transfert bitmap est zero-copy via `ImageBitmap`, et un crash du sketch n'affecte pas le scene-builder.

## 4. Résolution adaptive = vectorielle

Contexte: Les shaders GLSL sont vectoriels par nature. La résolution de sortie est la taille du render target.
Décision: Le preview suit la taille du viewport (ResizeObserver). L'export est configurable. Pas de slider de qualité.
Alternatives envisagées: Résolution fixe avec slider (complexité UI inutile), résolution réduite en édition (perte de fidélité).
Raison: Le shader s'adapte naturellement à toute résolution. Un FPS counter suffit pour signaler un shader trop lourd.

## 5. p5.js bundle size — non bloquant

Contexte: p5.js pèse ~1MB complet.
Décision: Accepter la taille, lazy load au premier accès au tab. Pas d'optimisation bundle à ce stade.
Raison: Le lazy import élimine l'impact sur le startup. L'optimisation prématurée du bundle est un frein au développement.

## 6. WireZone "shader" déclaré en V1

Contexte: Le wiring shader (signal → uniform) est prévu en V2, mais les types `WireZone` sont déjà définis dans `wiring-state.ts`.
Décision: Ajouter `"shader"` au type `WireZone` dès la V1, sans implémenter le wiring.
Alternatives envisagées: Attendre la V2 (risque de refactor des types, des tests, et des switch exhaustifs).
Raison: Coût zéro — c'est un string literal dans un union type. Évite une migration quand le wiring shader sera implémenté.

## 7. GLSL ES 3.0 uniquement

Contexte: WebGL2 (GLSL ES 3.0) est supporté par >97% des browsers. WebGL1 (GLSL ES 1.0) est le legacy.
Décision: Cibler GLSL ES 3.0 exclusivement. `#version 300 es` obligatoire.
Alternatives envisagées: Supporter les deux versions (double maintenance, boilerplate conditionnel, pas de bénéfice mesurable).
Raison: Pas de raison de traîner le legacy. Les presets, le boilerplate, et la validation sont plus simples avec une seule cible.

## 8. Format de distribution — JSON / ZIP

Contexte: Les shader themes doivent pouvoir être partagés et importés.
Décision: V1 = fichier `.json` standalone ou inclus dans le ZIP d'export (`shaders.json`). Pas de package manager.
Alternatives envisagées: npm-style package (trop lourd pour du contenu artistique), galerie web (scope V2+).
Raison: Le JSON est le format natif du shader editor. Le ZIP intègre déjà le workflow d'export/import. La galerie communautaire viendra quand le format sera stabilisé par l'usage.
