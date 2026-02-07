import { defineConfig } from "vite";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";

/** Mime types for assets served from the theme-citadel assets directory. */
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

export default defineConfig({
  root: "dev",
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      // Keeps working for TS/JS module imports (e.g. import ... from "/citadel-assets/...")
      "/citadel-assets/": path.resolve(__dirname, "packages/theme-citadel/assets") + "/",
    },
  },
  plugins: [
    {
      name: "serve-citadel-assets",
      configureServer(server) {
        const assetsDir = path.resolve(__dirname, "packages/theme-citadel/assets");

        // Serve /citadel-assets/* as static files from the theme-citadel assets dir.
        // resolve.alias only applies to JS module resolution, not runtime fetch().
        // This middleware handles the actual HTTP serving for PixiJS Assets.load().
        server.middlewares.use("/citadel-assets", (req, res, next) => {
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
    },
  ],
});
