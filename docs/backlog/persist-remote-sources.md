# Persistance des sources remote en localStorage
Tiers: interface
---

Les sources remote ajoutées manuellement disparaissent au reload du scene-builder. Sauvegarder la liste des sources remote (URL, nom, protocol, clé API) en `localStorage` pour les restaurer au démarrage.

Points d'attention :
- Ne pas persister les sources locales (elles viennent du discovery)
- Ne pas persister le status de connexion (toujours `disconnected` au reload)
- Stocker la clé API ? Risque sécurité mineur en dev local, mais à évaluer pour un build statique
