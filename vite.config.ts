import { defineConfig } from "vite";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";

/** Mime types for assets served from theme asset directories. */
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

/**
 * Create a Vite plugin that serves static assets from a theme's assets dir.
 * PixiJS Assets.load() uses runtime fetch() which bypasses resolve.alias,
 * so we need actual HTTP middleware.
 */
function serveThemeAssets(urlPrefix: string, assetsDir: string) {
  return {
    name: `serve-${urlPrefix.replace(/\//g, "")}-assets`,
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use(urlPrefix, (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: () => void) => {
        const urlPath = decodeURIComponent(req.url || "");
        const filePath = path.join(assetsDir, urlPath);
        try {
          if (existsSync(filePath) && statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
            createReadStream(filePath).pipe(res);
            return;
          }
        } catch {
          // fall through to next middleware
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: "dev",
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      "/citadel-assets/": path.resolve(__dirname, "packages/theme-citadel/assets") + "/",
      "/office-assets/": path.resolve(__dirname, "packages/theme-office/assets") + "/",
    },
  },
  plugins: [
    serveThemeAssets(
      "/citadel-assets",
      path.resolve(__dirname, "packages/theme-citadel/assets"),
    ),
    serveThemeAssets(
      "/office-assets",
      path.resolve(__dirname, "packages/theme-office/assets"),
    ),
  ],
});
