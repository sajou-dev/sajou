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
      console.info("[platformFetch] Tauri HTTP plugin loaded");
    }
  } catch (err) {
    console.warn("[platformFetch] Tauri HTTP plugin not available, falling back to browser fetch:", err);
  }
}

/**
 * Merge an extra header into fetch options, using a plain Record to avoid
 * the browser's forbidden-header restrictions on the Headers API.
 */
function withHeader(
  options: RequestInit | undefined,
  key: string,
  value: string,
): RequestInit {
  const existing = options?.headers;
  let plain: Record<string, string> = {};

  if (existing instanceof Headers) {
    existing.forEach((v, k) => { plain[k] = v; });
  } else if (Array.isArray(existing)) {
    for (const [k, v] of existing) { plain[k] = v; }
  } else if (existing) {
    plain = { ...existing };
  }

  if (!(key in plain)) {
    plain[key] = value;
  }

  return { ...options, headers: plain };
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
    // For local services (Ollama, etc.), inject Origin: http://localhost via
    // a plain header record. The browser Headers API silently drops "Origin"
    // (forbidden header), so we bypass it with a plain object that the Tauri
    // plugin passes straight through to the Rust HTTP client.
    if (_isLocalUrl(url)) {
      return _tauriFetch(url, withHeader(options, "Origin", "http://localhost"));
    }
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

/** Check if a URL targets a local service (localhost / 127.0.0.1). */
function _isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Whether we're running inside a Tauri desktop app. */
export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
