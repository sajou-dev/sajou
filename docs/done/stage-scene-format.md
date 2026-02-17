# Format déclaratif de scène Stage
Tiers: core
---
Stabiliser le JSON déclaratif : board, zones, slots, entités, lighting, particules.
Doit être expressif ET parseable côté Godot.
Définir le JSON Schema dans @sajou/schema.
Réf: docs/specs/sajou-stage.md § Prochaines étapes, point 2.

## Avancement
- [x] JSON Schema complet (stage-scene.schema.json)
- [x] TypeScript types alignés (stage-scene-types.ts)
- [x] Board, Zone, Slot, Ambiance, Connection
- [x] Lighting (global + point sources + flicker)
- [x] Particles (radial + directional)
- [x] Entity (visual, animations, interactions, rig)
- [x] 15 tests de validation schema
- [ ] Parsing côté Godot (GDScript loader)
- [ ] Exemple de scène complète (forge + remparts)
