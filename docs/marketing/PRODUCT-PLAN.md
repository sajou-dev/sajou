# sajou — Product Plan

> De projet personnel à produit public. Plan de lancement en 4 semaines.

---

## 1. Positionnement

### Ce que sajou est

sajou est un **choreographer visuel pour agents IA**. Il transforme les événements d'un agent (tâches, appels d'outils, coûts, erreurs) en scènes animées via un système de chorégraphies déclaratives et thématisables.

### Ce que sajou n'est pas

sajou n'est **pas un outil d'observabilité**. Ce n'est pas un concurrent de LangSmith, Langfuse, Datadog, ou Arize. Ces outils répondent à "qu'est-ce qui s'est passé et pourquoi ça a cassé ?". sajou répond à une question différente : **"à quoi ça ressemble quand mes agents travaillent ?"**

### Le paysage en 2026

Trois catégories d'outils coexistent, et sajou n'est dans aucune :

**Observabilité / Debugging** — LangSmith, Langfuse, Arize Phoenix, Helicone, Datadog LLM Obs, AgentOps, Braintrust, Maxim AI. Convergent tous vers traces, évaluation, coûts, latences. Le projet le plus visuel est AgentPrism (Evil Martians) — composants React pour des traces OpenTelemetry. Mais ça reste du debugging : "visualise ta trace", pas "regarde ta scène".

**Orchestration visuelle** — Ralv.ai se positionne comme une interface 3D pour *commander* des agents, inspirée des jeux de stratégie temps réel. "Command your digital workforce like a general, not a sysadmin."

**Ce que personne ne fait :** la couche de **mise en scène**. Le système qui dit : "quand ce signal arrive, joue cette séquence d'animations". Un langage déclaratif de chorégraphie visuelle, découplé du backend, thématisable, composable par des IA.

### Positionnement distinctif

sajou n'est ni un dashboard, ni un cockpit de commande. C'est une **régie de spectacle**.

L'analogie fondatrice vient du spectacle vivant et du VJing, pas du gaming :
- Les signaux sont des flux de données, comme du **MIDI, de l'OSC, de l'ArtNet**
- Les thèmes sont des scènes, comme une **composition MadMapper ou une timeline After Effects**
- Le choreographer est le système qui relie les deux — le **régisseur** qui dit "sur ce signal, joue cette séquence"

| | Observabilité | Orchestration | sajou |
|--|--------------|---------------|-------|
| **Question** | Qu'est-ce qui s'est passé ? | Que dois-je commander ? | À quoi ça ressemble ? |
| **Métaphore** | Tableau de bord | Poste de commandement | Scène de spectacle |
| **Interaction** | Analyser | Contrôler | Observer / créer |
| **Exemples** | LangSmith, Langfuse | Ralv.ai | sajou |

### One-liner

> **sajou — the missing stage between your agents and your screen.**

Variantes :
- *"sajou turns agent signals into visual performances."*
- *"MadMapper for AI agents."*
- *"The signals are the music. The themes are the dancers. sajou is the choreographer."*

### Proposition de valeur (3 axes)

1. **La mise en scène comme interface.** Les dashboards montrent des données. Les cockpits donnent des ordres. sajou crée des scènes vivantes. Même signal, thème Citadel (pixel art médiéval) ou thème Office (open space animé) — deux expériences visuelles radicalement différentes, zéro changement de code.

2. **Déclaratif et AI-composable.** Tout est JSON : chorégraphies, thèmes, entités. Comme un format ISF (Interactive Shader Format), chaque brique déclare ses inputs. Un LLM peut générer un thème complet — "fais-moi un thème cyberpunk pour mes agents" et sajou le joue.

3. **Backend-agnostique.** Un protocole de signaux standardisé (JSON/WebSocket). Un adaptateur = connecter n'importe quel orchestrateur. sajou consomme le flux, il ne contrôle rien.

---

## 2. Cible

### Persona primaire : "Le dev qui construit des agents"

- Utilise LangChain, CrewAI, AutoGen, Claude Code, ou des agents custom
- Passe du temps dans le terminal, lit des logs, scroll des traces
- Sait que ses agents font des trucs intéressants mais ne peut que les lire en texte
- Sensible à l'esthétique (utilise des outils soignés, customise son terminal)
- Actif sur GitHub, Twitter/X, Hacker News, Reddit r/LocalLLaMA, r/MachineLearning

**Ce qu'il veut :** voir ses agents en action de façon intuitive et engageante, sans intégrer une plateforme enterprise.

### Persona secondaire : "Le maker créatif"

- Artiste numérique, VJ, creative coder (Processing, TouchDesigner, MadMapper)
- Intéressé par l'IA comme matériau créatif
- Comprend le concept de signal → visuel (MIDI, OSC, ArtNet)
- Voit sajou comme un nouveau "VJ tool pour l'IA"

**Ce qu'il veut :** un framework pour créer des visualisations vivantes pilotées par des agents.

### Persona tertiaire : "L'éducateur / communicant"

- Doit expliquer ce que font des agents IA à des non-techniques
- Présentations, démos, vidéos
- A besoin de visuels qui racontent une histoire, pas de dashboards techniques

**Ce qu'il veut :** des démos visuelles impressionnantes pour montrer l'IA en action.

---

## 3. Modèle économique — recommandation

### Option recommandée : Open Core

Le core est open source (MIT). Des extensions premium apportent de la valeur aux utilisateurs sérieux.

| Couche | Licence | Contenu |
|--------|---------|---------|
| **Core** (gratuit, MIT) | Open source | `@sajou/core`, `@sajou/schema`, `@sajou/theme-api`, `@sajou/emitter`, thème Citadel, documentation, signal protocol |
| **Marketplace** (communauté) | Par thème | Thèmes communautaires gratuits/payants. sajou prend un % sur les payants (modèle Figma Community / Unity Asset Store) |
| **Scene Builder Pro** (payant) | Commercial | Éditeur visuel avancé : export de thèmes, choreography editor, multi-source compositor, collaboration |
| **sajou Cloud** (SaaS, V2+) | Abonnement | Hébergement de scènes, partage de liens live, replay d'enregistrements, API pour embedding |

### Pourquoi Open Core

- La cible (devs open source) exige du code ouvert. Pas de adoption sans MIT/Apache sur le core.
- Le core gratuit crée l'adoption. La marketplace et les outils créent le revenu.
- L'analogie est exacte : **Godot** (moteur gratuit) + **Asset Store** (écosystème payant), ou **Blender** (gratuit) + **Blender Market** (marketplace).

### Ne pas commencer par le monétiser

Pour le lancement dans 1 mois : tout est gratuit. L'objectif est l'adoption et le feedback. Le modèle économique se valide après les 100 premiers utilisateurs actifs.

---

## 4. Roadmap de lancement — 4 semaines

### Semaine 1 : Packaging & Documentation

**Objectif :** sajou est installable et compréhensible en 5 minutes.

- [ ] **npm publish** — publier `@sajou/core`, `@sajou/schema`, `@sajou/theme-api`, `@sajou/emitter` sur npm
- [ ] **`@sajou/theme-citadel`** publié comme premier thème de référence
- [ ] **`<sajou-player>`** web component — le moyen le plus simple d'intégrer sajou
- [ ] **README refonte** — pas un doc technique, une landing dans le README :
  - GIF animé du thème Citadel en action (hero)
  - "What is this?" en 3 phrases
  - Quickstart en 10 lignes de code
  - Lien vers les docs détaillées
- [ ] **Documentation développeur** (site ou GitHub Wiki) :
  - Getting Started (install → première scène en 5 min)
  - Signal Protocol Reference
  - Writing a Theme (guide)
  - Choreography Reference
  - API Reference (@sajou/core)
- [ ] **LICENSE** MIT sur tous les packages core

### Semaine 2 : Démo & Contenu Visuel

**Objectif :** sajou est "wow" en 30 secondes.

- [ ] **Démo live** hébergée — sajou.app ou sajou.dev/demo
  - Emetteur intégré qui génère des signaux réalistes
  - Switch de thème en un clic (Citadel ↔ Office)
  - Boutons pour déclencher des événements manuellement
- [ ] **GIF / vidéo courte** (15-30s) pour les réseaux sociaux
  - Montrer le même flux de signaux avec 2 thèmes différents
  - Le "aha moment" : ce n'est pas un dashboard, c'est une scène vivante
- [ ] **Démo "connecte ton agent"** — tutoriel WebSocket en 3 étapes :
  1. Lance sajou (`npx @sajou/player`)
  2. Envoie un signal JSON sur le WebSocket
  3. Regarde l'animation

### Semaine 3 : Landing Page & Open Source

**Objectif :** sajou a une présence publique.

- [ ] **Landing page** — sajou.app
  - Hero : vidéo/GIF du thème Citadel
  - 3 sections : Signals → Choreographer → Theme (l'architecture en action)
  - Code snippet (chorégraphie JSON)
  - CTA : GitHub + "Try the demo"
  - Brand guide appliqué (Sora, JetBrains Mono, DM Sans, palette Ember)
- [ ] **Repo GitHub public**
  - Description soignée, topics GitHub pertinents
  - `CONTRIBUTING.md` (comment contribuer un thème, un adaptateur, un primitif)
  - Issue templates (bug, feature request, theme proposal)
  - GitHub Actions CI (typecheck + tests)
  - Badges (build, npm version, license)
- [ ] **Social preview** (og:image) — le lockup sajou sur fond sombre

### Semaine 4 : Lancement & Distribution

**Objectif :** les premiers utilisateurs découvrent sajou.

- [ ] **Post Hacker News** — Show HN: sajou — a visual choreographer for AI agents
  - Timing : mardi ou mercredi, 10h-12h EST
  - Format : lien vers le README (pas la landing), commentaire de contexte
- [ ] **Post Reddit** — r/LocalLLaMA, r/MachineLearning, r/opensource
- [ ] **Post Twitter/X** — thread visuel (GIFs, comparaison dashboard vs sajou)
- [ ] **Post sur dev.to** et/ou **Hashnode** — article "I built a visual choreographer for AI agents"
  - Story personnelle : de VJ/creative coder à "pourquoi les agents IA méritent une scène, pas un dashboard"
  - Screenshots, GIFs, architecture expliquée simplement
- [ ] **Discord ou GitHub Discussions** activé pour la communauté
- [ ] **Analytics** — Plausible ou Umami sur la landing + npm downloads tracking

---

## 5. Prérequis techniques (état actuel → production-ready)

### Ce qui est prêt

| Composant | État | Notes |
|-----------|------|-------|
| `@sajou/core` | Production-ready | ~2000 LoC, testé, zero deps |
| `@sajou/schema` | Production-ready | JSON Schemas, types TS |
| `@sajou/theme-api` | Production-ready | Contrat d'interface stable |
| `@sajou/theme-citadel` | Fonctionnel | Thème complet avec PixiJS |
| `@sajou/theme-office` | Fonctionnel | Second thème parallèle |
| `@sajou/emitter` | Fonctionnel | Scénarios de test réalistes |
| Scene Builder | En cours (Phase 6) | Outil d'authoring, pas essentiel pour le launch |
| `<sajou-player>` | Nouveau | Web component, à polir |

### Ce qui manque pour le lancement

| Besoin | Priorité | Effort |
|--------|----------|--------|
| npm publish (tous les packages) | Critique | 1 jour |
| README hero (GIF animé du thème en action) | Critique | 1 jour |
| Documentation Getting Started | Critique | 2 jours |
| Démo live hébergée (sajou.app ou GitHub Pages) | Critique | 2 jours |
| Landing page | Important | 2-3 jours |
| CI GitHub Actions | Important | 0.5 jour |
| CONTRIBUTING.md + issue templates | Important | 0.5 jour |
| Adaptateur pour au moins 1 framework populaire (LangChain ou CrewAI) | Important | 2-3 jours |
| Blog post / article de lancement | Important | 1 jour |
| Vidéo/GIF pour réseaux sociaux | Nice to have | 1 jour |

### Décision clé : adaptateur de lancement

Pour que sajou ne soit pas juste une démo auto-alimentée, il faut **au moins un adaptateur réel** pour le lancement. Options par ordre d'impact :

1. **LangChain/LangGraph** — la plus grande base d'utilisateurs agents
2. **CrewAI** — en croissance rapide, communauté active
3. **OpenAI Agents SDK** — le nouveau standard OpenAI
4. **Claude Code / Anthropic** — alignement naturel avec la communauté Anthropic

Recommandation : **LangChain** (audience maximale) + **un guide "bring your own WebSocket"** (pour les agents custom).

---

## 6. Métriques de succès

### Semaine du lancement (S4)

| Métrique | Objectif | Outil |
|----------|----------|-------|
| GitHub stars | 200+ | GitHub |
| npm downloads (semaine 1) | 500+ | npm stats |
| Hacker News front page | Top 30 | HN |
| Demo page visits | 1000+ | Plausible/Umami |

### Mois 1 post-lancement

| Métrique | Objectif | Signal |
|----------|----------|--------|
| GitHub stars | 1000+ | Traction réelle |
| Contributors externes | 5+ | La communauté s'engage |
| Thèmes communautaires | 2+ | Le modèle de thèmes fonctionne |
| Issues ouvertes par des utilisateurs | 20+ | Des gens utilisent vraiment sajou |
| npm weekly downloads | 200+ stable | Adoption durable |

### Métriques qualitatives

- Des gens partagent des screenshots/GIFs de leurs scènes sajou sur Twitter
- Des articles/vidéos de tiers sur sajou
- Des demandes d'adaptateurs pour des frameworks non supportés
- Des propositions de thèmes par la communauté

---

## 7. Risques et mitigations

### Risque 1 : "C'est cool mais je ne sais pas pourquoi j'en ai besoin"

Le danger d'un produit esthétique : les gens admirent mais n'adoptent pas.

**Mitigation :** Le Getting Started doit montrer une utilité immédiate — connecter un agent réel en 5 minutes. Le message n'est pas "c'est beau" mais "tu vas enfin comprendre ce que ton agent fait, sans lire des logs".

### Risque 2 : "C'est trop compliqué à intégrer"

Le protocole de signaux custom est un friction point.

**Mitigation :** Adaptateurs prêts à l'emploi pour les frameworks populaires. Le chemin le plus court doit être : `npm install @sajou/langchain` → 3 lignes de config → ça marche.

### Risque 3 : "Un seul thème, pas assez de contenu"

Si au lancement il n'y a que Citadel, l'aspect "thématisable" reste théorique.

**Mitigation :** Publier au minimum 2 thèmes (Citadel + Office). Bonus : un thème "Minimal" purement SVG/CSS, très léger, qui montre qu'un thème n'a pas besoin d'être un jeu vidéo.

### Risque 4 : "Personne ne sait que ça existe"

Le marketing est le maillon faible typique des projets open source techniques.

**Mitigation :** Le GIF/vidéo est l'arme principale. Une démo visuelle de 15 secondes vaut 10 000 mots de documentation. Investir dans la qualité du contenu visuel avant le lancement.

---

## 8. Ce que je peux faire maintenant

En tant qu'assistant avec accès au codebase, je peux aider concrètement sur :

| Action | Type | Impact |
|--------|------|--------|
| Rédiger le README "hero" avec structure de landing | Contenu | Critique |
| Créer la landing page (HTML, brand guide appliqué) | Code + Design | Critique |
| Écrire la documentation Getting Started | Contenu | Critique |
| Configurer npm publish (package.json, .npmrc) | Config | Critique |
| Créer le CONTRIBUTING.md | Contenu | Important |
| Setup GitHub Actions CI | Config | Important |
| Écrire l'article de blog de lancement | Contenu | Important |
| Prototyper un adaptateur LangChain | Code | Important |
| Créer un thème Minimal (SVG/CSS, léger) | Code | Nice to have |

**Par quoi on commence ?**

---

*Document créé le 14 février 2026. À mettre à jour au fur et à mesure de l'avancement.*
