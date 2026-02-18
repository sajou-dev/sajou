# Portabilité des chorégraphies entre configurations signal
Tiers: core
---

**Bug / limitation actuelle** : quand on exporte une scène en ZIP et qu'un autre utilisateur l'importe, les wires sont liés à des source IDs spécifiques (ex: `local:claude-code`, `local:openclaw`). Si l'utilisateur cible n'a pas les mêmes sources, les chorégraphies ne se déclenchent jamais.

**Comportement attendu** : les chorégraphies doivent pouvoir être reconnectées à n'importe quelle source de signaux disponible. Le wire source → signal-type devrait être reconfigurable facilement, ou mieux, les chorégraphies devraient pouvoir écouter un signal-type indépendamment de la source.

Options :
1. À l'import, proposer un mapping "source dans le ZIP → source locale disponible"
2. Permettre des wires "any source" → signal-type (wildcard source)
3. Auto-wirer toutes les sources connectées aux signal-types utilisés par les chorégraphies

L'option 3 serait la plus transparente pour l'utilisateur. Pierre reprend un ZIP, connecte ses sources, les chorégraphies marchent automatiquement.

---
Implémenté: v0.3.x — 2026-02-18
Branch: `interface/import-portability`
Solution retenue: option 3 (auto-wire) + import sélectif par section.
