# Multi-agent source splitting
Tiers: interface
---
Quand plusieurs agents poussent des signaux sur le même endpoint local (`POST /api/signal`), tout arrive sous la source "Local" sans distinction.

Le champ `source` de chaque signal identifie l'agent émetteur (`"adapter:tap"`, `"adapter:tap:crewai"`, etc.) mais cette info n'est visible que dans le JSON déplié.

Idée : détecter dynamiquement les valeurs distinctes de `source` dans le flux Local et créer des sous-sources (chips enfants ou filtres automatiques) pour permettre de visualiser/filtrer par agent sans configuration manuelle.
