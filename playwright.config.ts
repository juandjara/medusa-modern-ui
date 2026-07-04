import { defineConfig } from "@playwright/test";

const BACKEND_URL = "http://localhost:8081";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4173",
    // Reuse the system Chrome instead of downloading a browser; CI installs
    // chromium via `pnpm exec playwright install chromium` and can drop this.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { MEDUSA_BACKEND_URL: BACKEND_URL },
  },
});
