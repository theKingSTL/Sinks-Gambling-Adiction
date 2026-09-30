import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

test("mobile: bottom nav, slip sheet opens and closes, no sideways scroll", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/nfl");

  const bottomNav = page.getByRole("navigation", { name: "Main (mobile)" });
  await expect(bottomNav).toBeVisible();
  const box = await bottomNav.boundingBox();
  expect(box!.y).toBeGreaterThan(page.viewportSize()!.height / 2); // actually at the bottom

  await page.locator("article button[aria-pressed]:not([disabled])").first().click();
  const bar = page.getByRole("button", { name: /Bet slip · 1/ });
  await expect(bar).toBeVisible();
  await bar.click();
  const sheet = page.getByRole("dialog", { name: "Bet slip" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Sign in to bet" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close slip" }).click();
  await expect(sheet).toBeHidden();

  await bottomNav.getByRole("link", { name: "Feed" }).click();
  await expect(page).toHaveURL(/\/feed/);
  await bottomNav.getByRole("link", { name: "Games" }).click();
  await expect(page).toHaveURL(/\/nfl/);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
