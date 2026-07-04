import { execSync } from "node:child_process";

const BACKEND_URL = "http://localhost:8081";
const E2E_DIR = new URL(".", import.meta.url).pathname;

// Reset the backend to the committed fixture state and start it fresh.
// The container must be stopped BEFORE the volume dir is replaced (a running
// container keeps the deleted inode and serves stale/broken state), and the
// fixture is copied to .runtime so test runs never dirty the seed.
export default async function globalSetup() {
  execSync(
    "docker compose down --timeout 30 && rm -rf .runtime && mkdir -p .runtime && cp -R fixtures/config .runtime/config && docker compose up -d",
    { cwd: E2E_DIR, stdio: "inherit" },
  );

  // Ready means "the app can actually issue a JWT", not just "the port answers".
  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v2/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "e2e", password: "e2e-password" }),
      });
      if (res.ok) break;
    } catch {
      // backend not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`Medusa backend at ${BACKEND_URL} not ready in 120s`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
