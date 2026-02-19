/**
 * Platform-aware fetch wrapper.
 *
 * - **Tauri desktop**: uses `@tauri-apps/plugin-http` fetch which goes through
 *   Rust, bypassing webview mixed-content and CORS restrictions.
 * - **Browser dev** (Vite): uses native fetch through the `/__proxy/` CORS proxy.
 * - **Browser production**: uses native fetch directly (may fail on mixed content).
 */

let _tauriFetch: typeof globalThis.fetch | null = null;
let _initialized = false;

/** Lazily resolve the Tauri HTTP plugin fetch, if running inside Tauri. */
async function init(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // window.__TAURI_INTERNALS__ is injected by Tauri's webview
    if ("__TAURI_INTERNALS__" in window) {
      const mod = await import("@tauri-apps/plugin-http");
      _tauriFetch = mod.fetch as unknown as typeof globalThis.fetch;
    }
  } catch {
    /* plugin not available — fall through to browser fetch */
  }
}

/**
 * Fetch a URL using the best available transport for the current platform.
 *
 * In Tauri: routes through Rust (no CORS, no mixed-content restrictions).
 * In dev browser: routes through the Vite CORS proxy `/__proxy/`.
 * In prod browser: uses native fetch directly.
 */
export async function platformFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  await init();

  // Tauri — Rust-side fetch, no restrictions
  if (_tauriFetch) {
    return _tauriFetch(url, options);
  }

  // Vite dev server — CORS proxy
  if (import.meta.env?.DEV) {
    const proxied = `/__proxy/?target=${encodeURIComponent(url)}`;
    return fetch(proxied, options);
  }

  // Production browser — raw fetch (may fail on mixed content)
  return fetch(url, options);
}

/** Whether we're running inside a Tauri desktop app. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
