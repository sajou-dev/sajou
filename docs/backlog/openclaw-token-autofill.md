# Auto-fill du token OpenClaw dans le scene-builder
Tiers: interface
---

Le token de connexion OpenClaw est stocké localement dans `~/.openclaw/openclaw.json` :

```sh
cat ~/.openclaw/openclaw.json | grep -A1 '"token"'
```

Aujourd'hui l'utilisateur doit le copier-coller manuellement dans le champ API Key du scene-builder.

## Idée

Ajouter un endpoint Vite dev server `GET /api/openclaw/token` qui lit le fichier et renvoie le token. Le champ API Key se pré-remplit automatiquement quand le protocole détecté est `openclaw`.

## Sécurité localhost — sans TLS

Le loopback (`127.0.0.1`) ne transite pas sur le réseau. Le challenge/response OpenClaw fait que le token ne circule qu'une seule fois au connect. Les browsers traitent localhost comme un secure context.

**Risque principal** : un onglet malveillant qui appelle `fetch("http://localhost:5177/api/openclaw/token")` — attaque cross-origin sur l'endpoint Vite.

### Options évaluées

| Approche | Complexité | Protection |
|---|---|---|
| **CORS strict + origin check** sur l'endpoint Vite | Faible | Bloque les onglets tiers |
| **One-time code** affiché en terminal, saisi dans le browser | Moyenne | Confirme la présence humaine |
| **Pas d'endpoint** — juste documenter le chemin du fichier | Zéro | Aucune surface d'attaque |
| **Unix socket** entre Vite et browser | Élevée | Inaccessible réseau |
| **SubtleCrypto + clé partagée** via fichier | Élevée | Encryption sans TLS |

### Recommandation

**CORS strict + origin check** (`Access-Control-Allow-Origin: http://localhost:5177`) suffit pour du dev local. C'est l'approche standard (LM Studio, Ollama, etc.). Le token ne sort jamais du loopback, et les requêtes cross-origin sont bloquées par le browser.

En production (build statique), l'endpoint n'existe pas — le champ reste manuel.

## Variantes d'implémentation

- **Auto-fill silencieux** : l'endpoint est appelé au detect du protocole `openclaw`, le champ se pré-remplit
- **Bouton "Paste from config"** : l'utilisateur clique explicitement pour remplir — plus visible, moins magique
- **Documentation seule** : placeholder ou tooltip indiquant `~/.openclaw/openclaw.json` — zéro code serveur
