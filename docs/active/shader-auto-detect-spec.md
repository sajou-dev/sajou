# Auto-détection des points d'entrée shader

## Objectif

Analyser statiquement le code GLSL pour détecter automatiquement les valeurs paramétrables et proposer de les exposer comme uniforms connectables au chorégraphe. Pas de LLM — du pattern matching pur.

## Trois niveaux de détection

### Niveau 1 — Uniforms existants (déjà implémenté)

Les `uniform` déclarés sont parsés et affichés dans le panneau. Les annotations `@ui` et `@bind` enrichissent les métadonnées.

```glsl
uniform float uSpeed; // @ui: slider, min: 0.0, max: 10.0
```

### Niveau 2 — Littéraux extractibles (Extract to Uniform)

Détecter les littéraux numériques dans le code et proposer leur extraction en uniforms.

**Patterns à détecter :**

| Pattern | Exemple | Type proposé |
|---------|---------|-------------|
| `vec2(lit, lit)` | `vec2(0.10, 0.25)` | `uniform vec2` — position 2D |
| `vec3(lit, lit, lit)` | `vec3(-2.0, 0.25, 0.0)` | `uniform vec3` — position 3D ou couleur |
| `vec4(lit, lit, lit, lit)` | `vec4(1.0, 0.5, 0.2, 1.0)` | `uniform vec4` — couleur RGBA |
| Float isolé dans une fonction connue | `sdSphere(pos, 0.25)` | `uniform float` — rayon/taille |
| `smoothstep(A, B, x)` | `smoothstep(0.008, 0.011, d)` | `uniform float` × 2 — seuils |
| `mix(a, b, FACTOR)` | `mix(color1, color2, 0.5)` | `uniform float` — facteur de mélange |
| `sin/cos(x * FREQ)` | `sin(iTime * 0.15)` | `uniform float` — fréquence |
| `pow(x, EXP)` | `pow(d, 2.2)` | `uniform float` — exposant/gamma |
| `clamp(x, MIN, MAX)` | `clamp(v, 0.0, 1.0)` | `uniform float` × 2 — bornes |

**UX :**
- Sélectionner un littéral dans l'éditeur → clic droit → "Extract to uniform"
- Ou : panneau latéral "Detected values" qui liste toutes les valeurs détectées avec un bouton "Expose"
- L'extraction remplace le littéral par le nom de l'uniform et ajoute la déclaration en haut du shader avec annotation `@ui` auto-générée (type de contrôle + min/max devinés depuis le contexte)

**Heuristiques pour min/max :**
- Valeur entre 0 et 1 → slider [0, 1]
- `vec3` avec composantes entre 0 et 1 → color picker
- `vec3` avec composantes > 1 ou négatives → position xyz
- Valeur utilisée comme multiplicateur de `iTime` → slider [0, 10]
- Valeur dans `smoothstep` → slider [0, valeur × 3]

### Niveau 3 — Structures composées (auto-grouping)

Détecter des patterns structurels qui représentent des groupes logiques.

**Tableaux de vecteurs = control points**

```glsl
ctrlPts.p[0] = vec2(0.10, 0.25);
ctrlPts.p[1] = vec2(0.2, 0.1);
ctrlPts.p[2] = vec2(0.6, 0.35);
// ...
```

Détection : assignations successives à un tableau/struct avec des littéraux vec2/vec3.
→ Proposer un groupe `@object: path` avec chaque élément comme `@bind: controlPoint[N]`.
→ Afficher comme une liste de points draggable dans le panneau uniforms.

**Palettes de couleurs**

```glsl
vec3 c = mix(vec3(0, 0.8, 0.9), c, ...);
c = mix(vec3(1, 0, 0.0), c, ...);
```

Détection : plusieurs `mix()` avec des `vec3` littéraux entre 0 et 1.
→ Proposer un groupe `@object: palette` avec chaque couleur comme `@bind: color[N]`.
→ Afficher comme une série de color pickers.

**Paramètres de distance field**

```glsl
sdSphere(pos - vec3(-2.0, 0.25, 0.0), 0.25)
sdBox(pos - vec3(1.0, 0.3, 0.0), vec3(0.3, 0.25, 0.25))
```

Détection : appels à des fonctions `sd*` (SDF primitives courantes).
→ Le premier argument après `pos -` = position, les suivants = dimensions.
→ Proposer un `@object` par primitive avec `@bind: position` et `@bind: scale`.

## Implémentation

### Parser

Un parser léger, pas un compilateur GLSL complet :

1. **Tokenizer** — extraire les tokens significatifs (identifiers, littéraux, ponctuation)
2. **Pattern matcher** — regex + state machine sur les séquences de tokens
3. **Context analyzer** — identifier dans quelle fonction/scope se trouve le littéral pour affiner les heuristiques (ex: un float dans `sdSphere` = rayon, un float après `* iTime` = fréquence)

```typescript
interface DetectedValue {
  /** Position dans le source (ligne, colonne, longueur) */
  location: { line: number; col: number; length: number };
  /** Texte original */
  raw: string;
  /** Valeur parsée */
  value: number | number[];
  /** Type GLSL détecté */
  glslType: "float" | "vec2" | "vec3" | "vec4";
  /** Contrôle UI suggéré */
  suggestedControl: "slider" | "color" | "xy" | "xyz" | "dial";
  /** Min/max suggérés */
  suggestedRange: { min: number; max: number } | null;
  /** Groupe détecté (control points, palette, SDF primitive) */
  group: { objectId: string; bindRole: string } | null;
  /** Confiance de la détection (0-1) */
  confidence: number;
  /** Contexte fonctionnel (nom de la fonction englobante, pattern détecté) */
  context: string;
}
```

### Workflow utilisateur

```
1. Coller un shader ShaderToy
2. Le parser détecte les valeurs → badge "12 values detected" dans le panneau
3. L'utilisateur ouvre le panneau → voit les valeurs groupées par objet/rôle
4. Clic "Expose" sur une valeur ou "Expose all" sur un groupe
5. Le code est modifié : littéral → uniform, déclaration ajoutée en haut
6. Le panneau uniforms se met à jour avec les contrôles
7. Les objets groupés (@object) apparaissent comme connecteurs pour le wiring
```

### Fichiers

```
tools/scene-builder/src/shader-editor/
├── shader-analyzer.ts        # Tokenizer + pattern matcher
├── shader-analyzer.test.ts   # Tests avec des shaders réels (iq, spline, etc.)
├── detected-values-panel.ts  # UI du panneau de détection
└── extract-to-uniform.ts     # Transformation du code source
```

## Ce que ça n'est PAS

- Pas un compilateur GLSL
- Pas du machine learning / LLM
- Pas infaillible — la confiance est affichée, l'utilisateur valide

## Shaders de référence pour les tests

- Spline Catmull-Rom (ls3SRr) — control points, moving object
- Primitives SDF d'iq — positions, dimensions, matériaux
- Reaction-diffusion — feed/kill rates, couleurs
- Tout shader avec `mainImage` copié depuis ShaderToy
