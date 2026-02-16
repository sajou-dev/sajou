# Persistence de l'état de la scène dans le navigateur
Tiers: interface
---
Actuellement un simple refresh du navigateur fait perdre tout le travail en cours dans le scene-builder. L'utilisateur doit avoir fait un export manuellement pour pouvoir reprendre.

Sauvegarder automatiquement l'état complet de la scène (entités, positions, routes, lighting, background, assets chargés) dans IndexedDB ou localStorage. Restaurer au chargement de la page. Envisager un autosave périodique + sauvegarde sur beforeunload.
