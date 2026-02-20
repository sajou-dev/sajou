/// <reference types="vite/client" />

/** App version injected by Vite from tauri.conf.json at build time. */
declare const __APP_VERSION__: string;

/** Server URL injected by Vite (SAJOU_SERVER env var or default localhost:3000). */
declare const __SERVER_URL__: string;
