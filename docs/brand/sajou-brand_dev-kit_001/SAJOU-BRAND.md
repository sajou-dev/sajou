# SAJOU-BRAND.md — Charte graphique et identité visuelle

> Ce document est la référence pour toute implémentation UI, site, app, docs, ou asset visuel de Sajou.
> Toute dérogation doit être explicitement validée. En cas de doute, ce document fait autorité.

---

## 1. Identité

**Nom** : sajou (toujours en minuscules)
**Tagline** : Visual Choreographer
**Description** : A visual choreographer for AI agents

**Écriture du nom** :
- ✅ `sajou`
- ❌ `Sajou`, `SAJOU`, `SaJou`, `Sajou™`

Le nom est toujours en minuscules, même en début de phrase dans les contextes techniques (code, UI, CLI). En prose/documentation, la majuscule de début de phrase est tolérée uniquement si l'outil l'impose.

---

## 2. Logomark

Le logomark est composé de 5 éléments indissociables :

1. **Tête** — squircle (carré arrondi, `rx="13"` sur un 44×44)
2. **Œil** — cercle plein positionné dans le tiers gauche de la tête
3. **Oreilles** — 2 rectangles arrondis au-dessus de la tête (optionnels sous 48px, interdits sous 32px)
4. **Queue** — courbe de Bézier partant du bord droit de la tête
5. **Signal dot** — cercle plein à l'extrémité de la queue

### Valeurs SVG de référence (viewBox 0 0 160 160)

```svg
<!-- Tête -->
<rect x="30" y="34" width="44" height="44" rx="13" stroke="{color}" stroke-width="2.5" fill="none" opacity="0.85"/>

<!-- Œil -->
<circle cx="46" cy="52" r="3.5" fill="{color}"/>

<!-- Oreille gauche -->
<rect x="36" y="24" width="9" height="12" rx="4.5" stroke="{color}" stroke-width="1.6" fill="none" opacity="0.35"/>

<!-- Oreille droite -->
<rect x="56" y="24" width="9" height="12" rx="4.5" stroke="{color}" stroke-width="1.6" fill="none" opacity="0.35"/>

<!-- Queue (courbe de Bézier) -->
<path d="M 74 60 C 90 66, 100 52, 104 40 C 108 28, 122 24, 132 34" stroke="{color}" stroke-width="2.5" stroke-linecap="round" fill="none"/>

<!-- Signal dot -->
<circle cx="132" cy="34" r="5" fill="{color}" opacity="0.9"/>
```

### Variantes par taille

| Taille | Oreilles | Stroke | Notes |
|--------|----------|--------|-------|
| ≥ 96px | Oui | 2.5-3px | Version complète |
| 48-96px | Oui (opacity 0.5) | 5px | Oreilles simplifiées |
| 32-48px | Non | 8px | Sans oreilles, squircle élargi (26,30,50,50 rx15) |
| ≤ 32px | Non | 14px | Favicon, très simplifié |

### Couleurs du logomark

| Contexte | Couleur |
|----------|---------|
| Sur fond sombre | `#E8A851` (Ember) |
| Sur fond clair | `#1A1A2E` (Dark Ink) |

**Jamais** de Ember (#E8A851) sur fond clair. **Jamais** de blanc ou gris clair sur fond sombre.

### Zone de protection

La zone de protection minimale autour du logomark = **1× la hauteur de la tête du squircle** sur tous les côtés. Aucun texte, image ou bordure ne doit entrer dans cette zone.

### Interdictions

- Ne pas modifier les proportions tête/queue
- Ne pas ajouter d'ombre portée
- Ne pas pivoter, incliner ou déformer
- Ne pas séparer les éléments (pas d'œil seul, pas de queue seule)
- Ne pas remplir (fill) la tête — le squircle est toujours en outline
- Ne pas animer individuellement les parties (si animation, le logomark bouge comme un tout)

---

## 3. Logotype

Le logotype est le mot "sajou" composé en **Sora weight 500**.

### Spécifications

```
Police : Sora
Weight : 500
letter-spacing : -1px (titres) à -0.5px (taille moyenne)
Casse : minuscules uniquement
```

### Trajectory underline

Un trait bézier subtil sous le logotype, à **25% d'opacité** de la couleur principale :

```svg
<path d="M 10 42 C 40 47, 100 40, 150 44 C 172 45, 184 42, 188 38" 
      stroke="{color}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.25"/>
```

Le underline est **optionnel** — à utiliser quand le logotype apparaît seul (sans le logomark). Dans le lockup, il n'est pas présent.

---

## 4. Lockup

Le lockup combine logomark + logotype + tagline.

### Composition (de gauche à droite)

1. Logomark (taille réduite, proportions conservées)
2. Séparateur vertical (`stroke="{color}" opacity="0.1"`)
3. Tagline en haut : `VISUAL CHOREOGRAPHER` en JetBrains Mono, 8.5px, `letter-spacing: 2px`, couleur Muted
4. Logotype en bas : `sajou` en Sora 500, 32px

### Règles du lockup

- Le séparateur est à **10% d'opacité** de la couleur accent
- L'espacement entre le logomark et le séparateur = l'espacement entre le séparateur et le texte
- Le lockup ne se déforme pas — s'il ne rentre pas, utiliser le logomark seul ou le logotype seul
- Pas de version verticale (logomark au-dessus du texte) pour l'instant

---

## 5. Palette de couleurs

### Palette principale — Ember

```css
:root {
  /* Fonds — du plus sombre au plus clair */
  --color-bg:        #07070C;   /* Fond principal */
  --color-surface:   #0E0E16;   /* Cards, panels, sidebars */
  --color-elevated:  #14141F;   /* Éléments surélevés, modals */

  /* Accent — la signature */
  --color-accent:       #E8A851;   /* Ember — accent principal */
  --color-accent-light: #F0C06A;   /* Hover, highlights */
  --color-accent-dim:   #A07232;   /* Bordures accent, ombres */

  /* Texte */
  --color-text:       #E8E8F0;   /* Texte principal */
  --color-text-muted: #6E6E8A;   /* Texte secondaire, descriptions */
  --color-text-dim:   #3A3A52;   /* Labels, metadata, timestamps */

  /* Structure */
  --color-border:      #1E1E2E;   /* Séparateurs, bordures par défaut */
  --color-border-hover: #2E2E44;  /* Bordures au hover */

  /* Sémantique */
  --color-success: #4A9E6E;   /* Confirmations, statut OK */
  --color-error:   #C44040;   /* Erreurs, alertes critiques */
  --color-warning: #E8A851;   /* Warnings (réutilise accent) */

  /* Fond clair (usage secondaire) */
  --color-dark-ink: #1A1A2E;   /* Couleur du logo/texte sur fond clair */
}
```

### Règles d'utilisation

- **Fond principal** : toujours sombre. Jamais `#000000` pur — utiliser `#07070C` minimum.
- **L'accent Ember** (`#E8A851`) est réservé aux éléments d'attention : logo, boutons primaires, liens actifs, sélections, indicateurs. **Ne pas l'utiliser pour du texte courant.**
- **Sur fond clair** : switcher toutes les couleurs accent vers `#1A1A2E` (Dark Ink). Ne jamais afficher du Ember sur fond blanc/clair.
- **Hiérarchie des fonds** : `bg` → `surface` → `elevated`. Chaque niveau est un layer visuel. Ne pas sauter de niveau (pas de `elevated` directement sur `bg` sans raison).
- **Bordures** : `#1E1E2E` par défaut, `#2E2E44` au hover. Les bordures sont subtiles, jamais proéminentes.

---

## 6. Typographie

### 3 familles, 3 rôles

| Famille | Rôle | Weights utilisés | Import |
|---------|------|-----------------|--------|
| **Sora** | Display, titres, branding, logotype | 300, 400, 500, 600 | Google Fonts |
| **JetBrains Mono** | Code, labels techniques, metadata, taglines | 300, 400, 500 | Google Fonts |
| **DM Sans** | Body text, descriptions, documentation, UI | 300, 400, 500, 700 | Google Fonts |

### Import Google Fonts

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
```

### Spécifications détaillées

#### Sora (Display)
```css
/* Titre principal (h1) */
font-family: 'Sora', sans-serif;
font-weight: 600;
letter-spacing: -1px;

/* Sous-titre (h2) */
font-weight: 500;
letter-spacing: -0.5px;

/* Logotype */
font-weight: 500;
letter-spacing: -1px;
text-transform: lowercase; /* toujours */
```

#### JetBrains Mono (Code & Labels)
```css
/* Labels uppercase (sections, badges) */
font-family: 'JetBrains Mono', monospace;
font-weight: 400;
font-size: 10px;
letter-spacing: 2px;
text-transform: uppercase;

/* Code inline et blocs */
font-weight: 400;
font-size: 13px;
letter-spacing: 0;

/* Tagline "VISUAL CHOREOGRAPHER" */
font-weight: 400;
font-size: 8.5px;
letter-spacing: 2px;
text-transform: uppercase;
color: var(--color-text-muted);
```

#### DM Sans (Body)
```css
/* Texte courant */
font-family: 'DM Sans', sans-serif;
font-weight: 400;
font-size: 14-16px;
line-height: 1.6;

/* Labels UI */
font-weight: 500;
font-size: 12-13px;
```

---

## 7. Iconographie

### Système d'icônes hybride

Sajou utilise un système hybride :
- **Icônes custom Sajou** pour les concepts architecturaux clés (les 3 couches)
- **Lucide Icons** pour l'UI générale (navigation, actions, statuts)

### Les 3 icônes de couche (custom Sajou)

Ces icônes sont dessinées dans le langage visuel du logomark : opacités progressives, courbes bézier, dots, squircle corners.

#### Signal
- **Concept** : onde qui arrive → données entrantes
- **Éléments** : 3 waves sinusoïdales d'opacité croissante (0.3 → 0.55 → 0.8) + dot d'impact + squircle récepteur
- **Fichier** : `icons/icon-signal.svg`
- **ViewBox** : `0 0 48 48`

#### Choreographer
- **Concept** : trajectoire bézier + timing nodes → la séquence d'actions
- **Éléments** : courbe bézier (reprend le langage de la queue du logo) + nodes d'opacité croissante (origin dim 0.4 → destination bright 1.0) + ticks de timing
- **Fichier** : `icons/icon-choreographer.svg`
- **ViewBox** : `0 0 48 48`

#### Theme
- **Concept** : couches de scène empilées → le rendu visuel
- **Éléments** : 3 rectangles arrondis empilés avec opacité croissante (0.25 → 0.5 → 0.85) + dot d'entité + sparkle
- **Fichier** : `icons/icon-theme.svg`
- **ViewBox** : `0 0 48 48`

### Propriétés des icônes custom

```css
/* Les icônes custom utilisent currentColor — elles héritent de la couleur du contexte */
/* Active/sélectionné */
color: var(--color-accent);   /* #E8A851 */

/* Inactif/défaut */
color: var(--color-text-muted);  /* #6E6E8A */

/* Disabled */
color: var(--color-text-dim);    /* #3A3A52 */
```

Toutes les icônes custom utilisent `stroke="currentColor"` et `fill="currentColor"` — elles héritent de la couleur CSS du parent. Ne jamais hardcoder de couleur dans les SVG inline.

### Lucide Icons — configuration

```
Bibliothèque : Lucide (https://lucide.dev)
Stroke width : 2px (défaut Lucide)
Taille : 24×24 (défaut), 16×16 (compact), 14×14 (inline)
Couleur : currentColor (même système que les icônes custom)
```

Lucide est utilisé pour : navigation, fichiers, settings, play/pause/stop, flèches, statuts (check, x, alert), édition (save, copy, paste), et tout ce qui n'est pas spécifique à l'architecture Sajou.

### Cohabitation custom + Lucide

Les icônes custom Sajou ont un ViewBox de 48×48 mais sont affichées aux mêmes tailles que Lucide (14-24px). La densité de détail est adaptée pour rester lisible à ces tailles.

Dans une même interface (sidebar, tab bar, toolbar), les icônes custom et Lucide cohabitent. La différence de "température" (les custom ont des opacités variables, Lucide est uniforme) est assumée — les icônes custom signalent visuellement que ces concepts sont spécifiques à Sajou.

---

## 8. Composants UI récurrents

### Badges / Labels techniques

```css
.badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  color: var(--color-text-dim);
}
```

### Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
}
.card:hover {
  border-color: var(--color-border-hover);
}
.card.selected {
  border-color: var(--color-accent);
  box-shadow: 0 0 20px rgba(232, 168, 81, 0.2);
}
```

### Section labels

```css
.section-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--color-accent);
}
```

### Boutons

```css
/* Primaire */
.btn-primary {
  background: var(--color-accent);
  color: var(--color-bg);
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
}
.btn-primary:hover {
  background: var(--color-accent-light);
}

/* Secondaire (ghost) */
.btn-secondary {
  background: transparent;
  color: var(--color-text-muted);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 8px 16px;
}
.btn-secondary:hover {
  border-color: var(--color-border-hover);
  color: var(--color-text);
}
```

### Bordures et rayons

```css
/* Rayons de bordure */
--radius-sm: 4px;    /* Badges, tags */
--radius-md: 6px;    /* Boutons, inputs */
--radius-lg: 8px;    /* Sous-cards, tooltips */
--radius-xl: 10px;   /* Cards principales */

/* Le squircle du logo utilise rx=13 sur 44×44 — ce ratio (≈30%) n'est PAS
   le rayon standard de l'UI. Le logo est une exception. */
```

---

## 9. Domaines et contact

| Domaine | Usage |
|---------|-------|
| sajou.org | Projet open source |
| sajou.dev | Ressources techniques |
| sajou.app | Futur produit |

| Email | Usage |
|-------|-------|
| hey@sajou.org | Contact général |
| lab@sajou.dev | Technique / contributions |

---

## 10. Quick reference — Copier-coller

### CSS Variables (copier dans tout projet)

```css
:root {
  --color-bg: #07070C;
  --color-surface: #0E0E16;
  --color-elevated: #14141F;
  --color-accent: #E8A851;
  --color-accent-light: #F0C06A;
  --color-accent-dim: #A07232;
  --color-text: #E8E8F0;
  --color-text-muted: #6E6E8A;
  --color-text-dim: #3A3A52;
  --color-border: #1E1E2E;
  --color-border-hover: #2E2E44;
  --color-success: #4A9E6E;
  --color-error: #C44040;
  --color-dark-ink: #1A1A2E;
}
```

### Google Fonts (copier dans tout `<head>`)

```html
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
```

### Tailwind config (si applicable)

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        sajou: {
          bg: '#07070C',
          surface: '#0E0E16',
          elevated: '#14141F',
          accent: '#E8A851',
          'accent-light': '#F0C06A',
          'accent-dim': '#A07232',
          text: '#E8E8F0',
          muted: '#6E6E8A',
          dim: '#3A3A52',
          border: '#1E1E2E',
          'border-hover': '#2E2E44',
          success: '#4A9E6E',
          error: '#C44040',
          'dark-ink': '#1A1A2E',
        }
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        body: ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        'sajou-sm': '4px',
        'sajou-md': '6px',
        'sajou-lg': '8px',
        'sajou-xl': '10px',
      }
    }
  }
}
```

---

## 11. Checklist de conformité

Avant de livrer toute interface, vérifier :

- [ ] "sajou" est en minuscules partout
- [ ] La police display est Sora (pas Inter, pas system-ui)
- [ ] La police code est JetBrains Mono (pas Fira Code, pas Menlo)
- [ ] La police body est DM Sans
- [ ] Le fond n'est jamais #000000 (utiliser #07070C minimum)
- [ ] L'accent Ember n'apparaît pas sur fond clair
- [ ] Les icônes des 3 couches utilisent les SVG custom (pas de substitution Lucide)
- [ ] Les icônes UI générales sont en Lucide (pas de mix avec un autre set)
- [ ] Le logomark n'est pas déformé, pivoté ou décomposé
- [ ] La zone de protection du logo est respectée
- [ ] Les oreilles du logomark sont absentes sous 32px
- [ ] Les bordures utilisent --color-border (pas de gris arbitraire)
- [ ] Les border-radius suivent l'échelle (4/6/8/10px, pas de valeurs aléatoires)
