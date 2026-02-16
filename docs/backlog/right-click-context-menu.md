# Menu contextuel (clic droit) + actions d'édition
Tiers: interface
---

## Menu contextuel

Capturer les événements clic droit (contextmenu) sur le canvas du scene-builder. Afficher un menu contextuel avec des actions adaptées à la cible.

### Actions du menu

**Sur un objet sélectionné :**
- Dupliquer (Ctrl+D) — copie décalée avec mêmes propriétés (sprite, billboard, layer, etc.)
- Copier (Ctrl+C)
- Coller (Ctrl+V)
- Couper (Ctrl+X)
- Supprimer (Del/Backspace)
- Propriétés — ouvrir le panneau de propriétés
- Changer de layer

**Sur le canvas (pas d'objet) :**
- Coller
- Ajouter entité / light / particule

Fonctionne pour tous les types d'objets : entités, point lights, positions, emitters.

### Première étape
Intercepter l'événement contextmenu et empêcher le menu natif du navigateur.
