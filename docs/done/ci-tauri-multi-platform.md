# CI/CD multi-plateforme pour Tauri
Tiers: infra
---
GitHub Actions workflow pour builder automatiquement les binaires Tauri sur chaque push/tag :
- macOS ARM (aarch64) + Intel (x86_64)
- Windows (MSI)
- Linux (AppImage / .deb)

Utiliser le workflow officiel Tauri (`tauri-apps/tauri-action`). Publier les artifacts sur les GitHub Releases pour chaque tag semver.

Budget : plan gratuit GitHub (2 000 min/mois, ~40 builds 3-plateformes).
