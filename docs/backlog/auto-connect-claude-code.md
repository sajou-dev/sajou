# Auto-connect Claude Code au démarrage
Tiers: interface
---

Actuellement `scanAndSyncLocal()` crée les entrées locales sans connecter aucune source. Claude Code (SSE interne) est le cas d'usage principal et pourrait être auto-connecté au démarrage puisqu'il est toujours disponible et ne nécessite aucune configuration.

Option : un flag `autoConnect` sur les `DiscoveredService` retournés par le serveur, que `scanAndSyncLocal()` honore pour les sources qui n'ont pas besoin de clé API.
