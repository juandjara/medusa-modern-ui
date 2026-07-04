import { test, expect } from "@playwright/test";

// A real write: change a settings value, save, verify it survives a full
// reload (i.e. it was persisted by the backend, not just draft state),
// then restore the original so the run stays idempotent.
test("search settings save and persist across reload", async ({ page }) => {
  const freqInput = page
    .locator("fieldset", { hasText: "Daily-search frequency" })
    .locator("input");
  const saveButton = page.getByRole("button", { name: "Save changes" });

  await page.goto("/settings/search");
  await expect(freqInput).toHaveValue("40");

  await freqInput.fill("45");
  await saveButton.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(freqInput).toHaveValue("45");

  await freqInput.fill("40");
  await saveButton.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(freqInput).toHaveValue("40");
});
