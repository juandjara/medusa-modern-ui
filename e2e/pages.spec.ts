import { test, expect } from "@playwright/test";

// Render smokes: every page loads, shows its heading, and settles into a
// sensible state (seeded data or a clean empty state — never an error).
// The fixture has two ended shows and no download activity, so History,
// Queue and Schedule legitimately render their empty states.

test("history renders its empty state", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText("No history entries.")).toBeVisible();
});

test("queue renders its empty state", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
  await expect(page.getByText("Queue is empty.")).toBeVisible();
});

test("schedule renders its empty state", async ({ page }) => {
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await expect(page.getByText("Nothing scheduled.")).toBeVisible();
});

test("system shows schedulers and disk space", async ({ page }) => {
  await page.goto("/system");
  await expect(page.getByRole("heading", { name: "System" })).toBeVisible();
  await expect(page.getByText("Schedulers")).toBeVisible();
  await expect(page.getByText("Disk space")).toBeVisible();
});

test("logs render the activity tab", async ({ page }) => {
  await page.goto("/logs");
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Errors" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Warnings" })).toBeVisible();
});
