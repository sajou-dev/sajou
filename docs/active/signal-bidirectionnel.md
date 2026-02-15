# Signaux bidirectionnels — canal retour utilisateur
Tiers: core
---
Étendre le bus de signaux pour les interactions utilisateur (user.click, user.move,
user.zone, user.command, user.point). Le Choreographer doit pouvoir réagir aux signaux
sortants comme aux signaux entrants. Le schema doit documenter les types user.*.
Réf: docs/specs/sajou-stage.md § Les interactions — le canal retour.

## Avancement
- [x] 5 types user.* dans @sajou/schema (TypeScript + JSON Schema)
- [x] Payloads typés (UserClickPayload, UserMovePayload, etc.)
- [x] Tests de type safety + narrowing (6 tests)
- [ ] Choreographer : réagir aux signaux user.* (feedback visuel)
- [ ] Bus WebSocket : signaux sortants vers les agents
