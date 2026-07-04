import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Overridable so e2e runs can point dev/preview at the dockerized backend
// (vite preview inherits server.proxy when preview.proxy is unset).
const SERVER_URL = process.env.MEDUSA_BACKEND_URL ?? "http://192.168.1.166:8888";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: SERVER_URL, changeOrigin: true },
      "/token": { target: SERVER_URL, changeOrigin: true },
      "/login": { target: SERVER_URL, changeOrigin: true },
      "/logout": { target: SERVER_URL, changeOrigin: true },
      "/images": { target: SERVER_URL, changeOrigin: true },
      // Tornado serves the Recommended posters and other cached assets under
      // /cache/images/<source>/<file>; needs its own proxy entry.
      "/cache": { target: SERVER_URL, changeOrigin: true },
      "/home": { target: SERVER_URL, changeOrigin: true },
      "/errorlogs": { target: SERVER_URL, changeOrigin: true },
      "/browser": { target: SERVER_URL, changeOrigin: true },
      "/config/postProcessing": { target: SERVER_URL, changeOrigin: true },
      "/config/general": { target: SERVER_URL, changeOrigin: true },
      "/ws": {
        target: SERVER_URL.replace("http", "ws"),
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
