# Client offline resilience
Tiers: infra
---

Le scene-builder doit fonctionner sans impact quand le serveur sajou (MCP) est injoignable — déconnexion réseau, serveur down, mode offline.

## État actuel

- `probeServer()` : timeout 2s, catch silencieux → fallback IDB. OK.
- `state-sync.ts` : push silencieux, pas de spam. OK.
- `command-consumer.ts` : le polling fallback tourne à 500ms sans backoff quand le SSE échoue. Gaspillage réseau sur serveur mort.

## À faire

- Backoff exponentiel sur le polling fallback (500ms → 1s → 2s → 5s → 30s max)
- Indicateur visuel discret dans le header : connecté / déconnecté du serveur
- Quand le serveur revient, re-sync automatique (push state local → serveur)
- Vérifier que le mode Tauri prod (pas de serveur) ne déclenche aucun trafic réseau inutile (déjà gardé par `!isTauri()`, mais à confirmer)
