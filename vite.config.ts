import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SERVER_URL = "http://192.168.1.166:8888";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: SERVER_URL, changeOrigin: true },
      "/token": { target: SERVER_URL, changeOrigin: true },
      "/login": { target: SERVER_URL, changeOrigin: true },
      "/images": { target: SERVER_URL, changeOrigin: true },
      "/home": { target: SERVER_URL, changeOrigin: true },
      "/ws": {
        target: SERVER_URL.replace("http", "ws"),
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
