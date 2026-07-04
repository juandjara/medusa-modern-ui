import { test, expect } from "@playwright/test";

// Walking skeleton: sign in against the dockerized clean backend and see the
// seeded library. Also asserts the WebSocket connects (sidebar indicator),
// which exercises the legacy /login cookie + /ws proxying end to end.
test("sign in and see the seeded show library", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/signin/);

  await page.locator('input:not([type="password"])').first().fill("e2e");
  await page.locator('input[type="password"]').fill("e2e-password");
  await page.locator('button[type="submit"]').click();

  await expect(page.getByRole("heading", { name: "Shows" })).toBeVisible();
  await expect(page.getByText("Breaking Bad")).toBeVisible();
  await expect(page.getByText("Firefly")).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 15_000 });
});
