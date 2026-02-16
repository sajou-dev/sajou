# Rescan automatique périodique des services locaux
Tiers: interface
---

Aujourd'hui le rescan des services locaux est manuel (bouton Rescan). Un timer périodique (toutes les 30s ?) pourrait rescanner automatiquement et mettre à jour les statuts (unavailable → disconnected si le service revient, ou l'inverse).

Contrainte : ne jamais interrompre une connexion active. Le rescan ne touche que les sources non connectées.
