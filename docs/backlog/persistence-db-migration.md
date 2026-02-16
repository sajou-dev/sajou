# Migration de schéma IndexedDB
Tiers: infra
---
`persistence-db.ts` utilise `DB_VERSION = 1`. L'ajout de nouveaux object stores est déjà géré dans `onupgradeneeded` (crée les stores manquants), mais la transformation de données existantes ne l'est pas.

Si le format des données persistées change (ex: restructuration du `SceneState`, ajout de champs obligatoires), il faudra :
- Incrémenter `DB_VERSION`
- Ajouter une logique de migration dans `onupgradeneeded` (lire ancienne donnée → transformer → réécrire)
- Gérer le fallback si la migration échoue (reset propre avec message utilisateur)
