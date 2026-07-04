import { test as setup, expect } from "@playwright/test";
import { AUTH_STATE } from "../playwright.config";

// Signs in once with "Remember me" (JWT goes to localStorage instead of
// sessionStorage, so storageState can capture it) and saves the browser
// state for every other spec. The login flow itself is covered by smoke.spec.
setup("authenticate", async ({ page }) => {
  await page.goto("/signin");
  await page
    .locator('input:not([type="password"]):not([type="checkbox"])')
    .first()
    .fill("e2e");
  await page.locator('input[type="password"]').fill("e2e-password");
  await page.getByLabel("Remember me").check();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Shows" })).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE });
});
