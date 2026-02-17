# Feedback visuel pour le token auto-rempli
Tiers: interface
---

Quand le token OpenClaw est auto-rempli depuis `~/.openclaw/openclaw.json`, le champ password masque la valeur et rien ne confirme visuellement que le remplissage a eu lieu. Un petit indicateur (check vert, badge "auto-filled", ou tooltip) aiderait à comprendre que la clé est déjà là.

Applicable aussi aux futures sources qui supporteraient l'auto-fill (ex: clé Anthropic depuis `~/.anthropic/key`).

## Livré

- `tokenAutoFilled` flag on `SignalSource` type
- Green check badge in popover key row when auto-filled
- Manual key edit clears the flag
- CSS class `.sv-token-autofilled`

Mergé dans v0.2.0.
