# Signal relay de test sur test.sajou.dev
Tiers: infra
---

L'URL par défaut des sources remote est `wss://test.sajou.dev/signals` mais ne pointe vers rien. Implémenter un endpoint WebSocket qui émet des signaux de démo (scénarios prédéfinis, boucle de replay) pour que les nouveaux utilisateurs puissent tester le pipeline sans rien installer.

Variantes :
- Replay d'un scénario fixe (comme l'emitter local)
- Replay de signaux enregistrés (record/replay)
- Endpoint SSE alternatif pour les clients qui ne supportent pas WebSocket
