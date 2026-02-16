# Persister la source active dans le connector bar
Tiers: interface
---
`activeSourceId` dans `connector-bar-horizontal.ts` est un état transient (module-level variable) qui repart à `null` au reload. C'est la source sélectionnée dans la barre connecteur H — elle teinte les badges signal-type et les wires avec la couleur de la source, et dim les nœuds chorégraphie non connectés.

Persister cette sélection dans `sajou:editor-prefs` (localStorage) permettrait de retrouver le contexte visuel exact après un reload. Impact faible mais améliore la continuité de l'expérience.
