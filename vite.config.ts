import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "https://pymedusa.djara.dev", changeOrigin: true },
      "/token": { target: "https://pymedusa.djara.dev", changeOrigin: true },
      "/login": { target: "https://pymedusa.djara.dev", changeOrigin: true },
      "/images": { target: "https://pymedusa.djara.dev", changeOrigin: true },
      "/ws": {
        target: "wss://pymedusa.djara.dev",
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
