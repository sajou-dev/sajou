# Canal retour aux interactions utilisateur
Tiers: core
---
Le Choreographer doit pouvoir réagir aux signaux user.* (user.click, user.move, etc.)
pour produire du feedback visuel. Les interactions utilisateur doivent aussi pouvoir
remonter vers les agents via un bus sortant (WebSocket).

Les types user.* existent déjà dans @sajou/schema — il manque la boucle complète :
- Choreographer : matcher + performances déclenchées par user.*
- Bus sortant : relayer les signaux user.* vers les agents connectés
