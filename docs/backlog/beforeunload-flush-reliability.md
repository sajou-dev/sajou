# Fiabilité du flush beforeunload
Tiers: interface
---
Le handler `beforeunload` dans `persistence.ts` démarre des transactions IndexedDB mais ne peut pas les `await` (l'API est synchrone). En pratique, les navigateurs laissent les transactions IDB se terminer avant le teardown, mais un crash brutal pourrait perdre les ~500ms de changements non flush.

Pistes d'amélioration :
- Réduire le debounce à 200ms pour les changements critiques (scène, wiring)
- Utiliser `navigator.sendBeacon()` pour un subset critique (mais ça ne supporte pas IDB)
- Sauvegarder un snapshot périodique (toutes les 30s) en plus du debounce, comme filet de sécurité
- Accepter la perte mineure et documenter que Ctrl+S (export ZIP) reste la sauvegarde de référence
