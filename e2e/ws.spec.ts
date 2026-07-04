import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8081";

// The headline live-updates claim: with the Queue page open and idle, a
// queue item triggered out-of-band (direct API call, not through this tab)
// must appear WITHOUT any navigation or reload — pushed via /ws/ui.
test("queue page updates live when work is queued elsewhere", async ({
  page,
  request,
}) => {
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();

  // A rescan renders as a queue entry named "Refresh" for the show. Earlier
  // specs may have left other queue items (manual searches), so scope the
  // assertion to this specific action instead of assuming an empty queue.
  const rescanItem = page
    .locator("li", { hasText: "Refresh" })
    .filter({ hasText: "Firefly" });
  await expect(rescanItem).toHaveCount(0);

  const auth = await request.post(`${BACKEND_URL}/api/v2/authenticate`, {
    data: { username: "e2e", password: "e2e-password" },
  });
  const { token } = await auth.json();
  const res = await request.post(`${BACKEND_URL}/api/v2/massupdate`, {
    headers: { "x-auth": `Bearer ${token}` },
    data: { rescan: ["tvdb78874"] },
  });
  expect(res.ok()).toBe(true);

  // The rescan is queued, runs and completes — the page must reflect it
  // purely from WebSocket pushes.
  await expect(rescanItem.first()).toBeVisible({ timeout: 30_000 });
});
