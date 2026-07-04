import { defineConfig } from "@playwright/test";

const BACKEND_URL = "http://localhost:8081";

// Written by e2e/auth.setup.ts; lives in .runtime so it's wiped with the rest
// of the per-run state. Contains the remember-me JWT (localStorage) and the
// SECURE_TOKEN cookie the WebSocket needs.
export const AUTH_STATE = "e2e/.runtime/auth.json";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // All specs share one stateful backend; parallel workers race each other
  // (e.g. a queued rescan breaks the queue-empty smoke). Serial keeps runs
  // deterministic — spec files execute in alphabetical order.
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    // Locally, reuse the system Chrome instead of downloading a browser;
    // CI installs chromium via `pnpm exec playwright install chromium`.
    ...(process.env.CI ? {} : { channel: "chrome" as const }),
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { storageState: AUTH_STATE },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { MEDUSA_BACKEND_URL: BACKEND_URL },
  },
});
