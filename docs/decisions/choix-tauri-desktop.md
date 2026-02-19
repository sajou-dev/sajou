# Tauri v2 comme shell desktop pour le scene-builder

Date: 2025-02-19

## Contexte

Le scene-builder est déployé comme site statique sur sajou.app, mais les navigateurs bloquent les requêtes HTTP vers localhost depuis une origine HTTPS (mixed content + Private Network Access). Les sources locales (LM Studio, Ollama, OpenClaw) sont inaccessibles depuis le web.

Deux pistes évaluées : PWA (vite-plugin-pwa) et Tauri.

## Décision

**Tauri v2** comme shell natif pour le scene-builder.

## Alternatives envisagées

- **PWA** : ne résout pas le problème fondamental — le Service Worker reste dans le sandbox du navigateur, les mêmes restrictions mixed-content s'appliquent.
- **MCP server headless** (déployé sur mcp.sajou.app) : fonctionne pour l'API distante mais ne peut pas atteindre les services locaux de l'utilisateur.
- **Electron** : non envisagé — trop lourd, embarque un Chromium complet.

## Raison

- Tauri wraps le même build Vite dans un webview natif (WKWebView sur macOS) — zéro réécriture du frontend
- `tauri-plugin-http` route les requêtes HTTP via Rust, bypass complet des restrictions CORS/mixed-content
- L'app produite fait ~3.4 MB (DMG) vs ~200 MB pour Electron
- Le mode `tauri dev` conserve le workflow dev existant (Vite HMR, Claude Code tap hooks, MCP server)
- Le travail fait pour sajou.app (client-side discovery, platformFetch) a directement préparé l'intégration Tauri

## Détails techniques

- **`platformFetch()`** : wrapper qui choisit automatiquement Tauri HTTP plugin / Vite CORS proxy / native fetch
- **Probe Claude Code** : désactivée en production (le SPA fallback retourne 200 pour toute URL, faux positif) ; active en `tauri dev`
- **`window.confirm()`** : ne fonctionne pas dans WKWebView de Tauri → remplacé par un dialog HTML custom
- **HTTP scope** : `http://*:*` nécessaire (pas `http://**`) pour autoriser les ports arbitraires
- **Webview cache** : stocké dans `~/Library/WebKit/dev.sajou.scene-builder/` — peut nécessiter un nettoyage entre builds
