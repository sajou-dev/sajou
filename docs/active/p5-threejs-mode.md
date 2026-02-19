# Mode Three.js dans l'éditeur p5
Tiers: interface
---

Ajouter un mode Three.js à l'éditeur p5.js (à côté du mode p5 existant). L'utilisateur pourrait écrire du code Three.js en instance mode, avec le même système de params/bindings que p5.

Le terrain est déjà préparé : le scene-builder utilise Three.js partout (WebGLRenderer, scène, caméras, materials). On pourrait exposer un `renderer` + `scene` + `camera` pré-configurés dans le sketch, comme on injecte `p.sajou.*` pour p5.

Idée d'API sketch :

```javascript
// @param: speed, slider, min: 0.1, max: 5.0
// @bind: intensity

function setup(ctx) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8a851 });
  ctx.cube = new THREE.Mesh(geo, mat);
  ctx.scene.add(ctx.cube);
}

function draw(ctx) {
  ctx.cube.rotation.y += ctx.sajou.speed * ctx.deltaTime;
}
```

Avantages :
- Réutilise le renderer Three.js existant (pas de nouveau contexte WebGL)
- Mêmes annotations `@param:` / `@bind:` que p5
- Même wiring MCP (`POST /api/p5/:id/params`)
- Ouvre la porte aux effets 3D custom (particules avancées, post-processing, geometry shaders)
