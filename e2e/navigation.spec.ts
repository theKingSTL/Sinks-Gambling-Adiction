import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

test("sport tabs switch leagues", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/nfl$/);
  for (const [tab, heading, path] of [
    ["NCAAF", "College Football", "/ncaaf"],
    ["MLB", "MLB", "/mlb"],
    ["NBA", "NBA", "/nba"],
    ["NFL", "NFL", "/nfl"],
  ] as const) {
    await page.getByRole("navigation", { name: "Sport" }).getByRole("link", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  expect(errors).toEqual([]);
});

test("football weeks: arrows, any week of the season, back to this week", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/nfl");
  const select = page.getByRole("combobox", { name: "Week" });
  const start = await select.inputValue();

  await page.getByRole("link", { name: /^Next:/ }).click();
  await expect(select).not.toHaveValue(start);
  await page.getByRole("link", { name: /^Previous:/ }).click();
  await expect(select).toHaveValue(start);

  // Jump to the last regular-season week — months ahead.
  const week18 = await select.locator("option", { hasText: "Week 18" }).getAttribute("value");
  await select.selectOption(week18!);
  await expect(page).toHaveURL(/week=18/);
  await expect(page.getByText(/Week 18 · /)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();

  await page.getByRole("link", { name: "This week" }).click();
  await expect(select).toHaveValue(start);
  expect(errors).toEqual([]);
});

test("day browsing: arrows, day pills, date picker far ahead, next game day", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/nba?day=20261220");
  await expect(page.getByRole("link", { name: "Sun, Dec 20" })).toHaveAttribute("aria-current", "date");

  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/day=20261221/);
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/day=20261220/);
  await page.getByRole("link", { name: "Wed, Dec 23" }).click();
  await expect(page).toHaveURL(/day=20261223/);

  await page.getByLabel("Jump to").fill("2026-12-25");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page).toHaveURL(/day=20261225/);
  await expect(page.locator("article").first()).toBeVisible(); // Christmas slate

  await page.getByRole("link", { name: "Next game day →" }).click();
  await expect(page).toHaveURL(/day=2026122[6-9]|day=2026123/);

  await page.getByRole("link", { name: "Back to today" }).click();
  await expect(page).toHaveURL(/\/nba(\?|$)/);
  expect(errors).toEqual([]);
});

test("game page: predictions, lines, back link", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/nfl");
  await page.getByRole("link", { name: "Stats & predictions →" }).first().click();
  await expect(page).toHaveURL(/\/games\/nfl\/\d+/);
  await expect(page.getByRole("heading", { name: "Prediction" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Win probability/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /All NFL games/ }).click();
  await expect(page).toHaveURL(/\/nfl$/);
  expect(errors).toEqual([]);
});

test("old links still resolve", async ({ page }) => {
  await page.goto("/games/401866757");
  await expect(page).toHaveURL(/\/games\/nba\/401866757/);
  await expect(page.getByRole("heading", { name: "PHI box score" })).toBeVisible();
  await page.goto("/?day=20261225");
  await expect(page).toHaveURL(/\/nba\?day=20261225/);
});
