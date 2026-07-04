import { test, expect } from "@playwright/test";

const card = (page: import("@playwright/test").Page, title: string) =>
  page.locator('a[href^="/show/"]', { hasText: title });

test.describe("show list", () => {
  test("filters the library and updates the URL", async ({ page }) => {
    await page.goto("/");
    await expect(card(page, "Breaking Bad")).toBeVisible();
    await expect(card(page, "Firefly")).toBeVisible();

    await page.getByPlaceholder("Filter shows…").fill("fire");
    await expect(page).toHaveURL(/q=fire/);
    await expect(card(page, "Firefly")).toBeVisible();
    await expect(card(page, "Breaking Bad")).toHaveCount(0);

    await page.getByPlaceholder("Filter shows…").fill("");
    await expect(card(page, "Breaking Bad")).toBeVisible();
  });

  test("shows an empty state for a no-match filter", async ({ page }) => {
    await page.goto("/?q=zzz-no-such-show");
    await expect(page.getByText("No shows match your filter.")).toBeVisible();
  });
});

test.describe("show detail", () => {
  test("renders seasons and metadata for a seeded show", async ({ page }) => {
    await page.goto("/");
    await card(page, "Breaking Bad").click();

    await expect(
      page.getByRole("heading", { name: "Breaking Bad" }),
    ).toBeVisible();
    await expect(page.getByText("Ended")).toBeVisible();
    await expect(page.getByText("Season 5")).toBeVisible();
    await expect(page.getByText("Season 1")).toBeVisible();
  });

  test("pause and resume a show", async ({ page }) => {
    await page.goto("/");
    await card(page, "Firefly").click();
    await expect(
      page.getByRole("heading", { name: "Firefly" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: "Pause show" }).click();
    await expect(page.getByText("This show is paused")).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: "Resume show" }).click();
    await expect(page.getByText("This show is paused")).toBeHidden();
  });
});
