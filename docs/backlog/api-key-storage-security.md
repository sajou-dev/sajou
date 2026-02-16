# Sécurité du stockage des clés API en localStorage
Tiers: interface
---
Les clés API des sources remote sont stockées en clair dans `localStorage` (`sajou:remote-sources`). Acceptable en dev local, mais à évaluer si le scene-builder est déployé en build statique (hébergé publiquement).

Options :
- Exclure les clés API de la persistance, les redemander à chaque session
- Chiffrer les clés avec un mot de passe utilisateur (complexité vs usage)
- Utiliser `sessionStorage` au lieu de `localStorage` (clés perdues à la fermeture d'onglet)
- Accepter le risque en documentant que c'est un outil dev-only
