import { test, expect } from "@playwright/test";

// Manual episode search against the mock Newznab provider (the `mocknews`
// compose service). Covers the whole loop: search queue → provider request →
// results streamed back into the modal (addManualSearchResult over the
// WebSocket, with the completion refetch as safety net).
test("manual episode search surfaces mock provider results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('a[href^="/show/"]', { hasText: "Firefly" }).click();
  await expect(page.getByRole("heading", { name: "Firefly" })).toBeVisible();

  // Seasons start collapsed; expand and open the episode's manual search.
  await page.getByRole("button", { name: /Season 1/ }).click();
  await page.getByRole("button", { name: "The Train Job" }).click();

  await expect(page.getByText(/from 1 provider/)).toBeVisible();
  await page.getByRole("button", { name: "Re-run search" }).click();

  // The backend search queue usually finishes in a few seconds; give slack.
  await expect(
    page.getByText("Firefly.S01E01.Serenity.1080p.WEB-DL.DD5.1.H.264-E2EMOCK"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText("Firefly.S01E01.Serenity.720p.HDTV.x264-E2EMOCK"),
  ).toBeVisible();
});
