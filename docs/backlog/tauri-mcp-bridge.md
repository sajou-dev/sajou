# MCP Bridge pour Tauri production
Tiers: infra
---

En `tauri dev`, le MCP fonctionne via les endpoints HTTP du Vite dev server. En `tauri build` (production), ces endpoints n'existent plus — le MCP stdio ne peut pas communiquer avec le WebView.

Solution envisagée : plugin Rust (axum) qui démarre un serveur HTTP local et relaie les commandes vers le WebView via Tauri IPC/events. Le MCP stdio server continuerait à faire des `fetch()` vers `localhost:port`, mais c'est le Rust qui répond au lieu de Vite.

Alternative : connecter le MCP headless distant (`mcp.sajou.app`) au lieu du local.
