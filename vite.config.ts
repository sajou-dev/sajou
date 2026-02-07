import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: "dev",
  server: {
    port: 5173,
    open: true,
    fs: {
      // Allow serving SVG assets from theme-citadel
      allow: ["..", path.resolve(__dirname, "packages/theme-citadel/assets")],
    },
  },
  resolve: {
    alias: {
      // Map /citadel-assets/ to the theme-citadel assets directory
      "/citadel-assets/": path.resolve(__dirname, "packages/theme-citadel/assets") + "/",
    },
  },
});
