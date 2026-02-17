# Filtres de signal (pre/post/inter-process)
Tiers: core
---
Remplacer la logique `when` statique par une barre de filtres positionnables : en amont d'un bloc (pre-filter), en aval (post-filter), ou entre deux étapes d'un bloc (inter-process). Les filtres sont des nœuds visuels dans le patch bay, chaînables.

Types de filtres : throttle, debounce, gate, seuil, delta min, sample 1/N, accumulate, map/transform, sample & hold.

Remplace et généralise l'idée initiale de préfiltres sur wires uniquement.
