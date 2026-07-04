import { execSync } from "node:child_process";

const BACKEND_URL = "http://localhost:8081";
const E2E_DIR = new URL(".", import.meta.url).pathname;

const sh = (cmd: string) => execSync(cmd, { cwd: E2E_DIR, stdio: "inherit" });

// Reset the backend to the committed fixture state and start it fresh.
// The container must be stopped BEFORE the volume content is replaced, and
// the fixture is synced into .runtime so test runs never alter the seed data.
export default async function globalSetup() {
  sh("docker compose down --timeout 30");
  sh("mkdir -p .runtime/config");
  sh("rsync -a --delete fixtures/config/ .runtime/config/");
  sh("docker compose up -d");

  // Ready means "the app can actually issue a JWT", not just "the port
  // answers". If the container died at boot (the race above, or a crash),
  // one restart attempt is allowed before the deadline kills the run.
  const deadline = Date.now() + 120_000;
  let restarted = false;
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

    const running = execSync("docker compose ps --status running -q", {
      cwd: E2E_DIR,
    })
      .toString()
      .trim();
    if (!running && !restarted) {
      restarted = true;
      sh("docker compose up -d");
    }

    if (Date.now() > deadline) {
      throw new Error(`Medusa backend at ${BACKEND_URL} not ready in 120s`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
