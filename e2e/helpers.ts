import { expect, type Browser, type Page } from "@playwright/test";

export const runId = Date.now().toString(36).slice(-6);

/** Fail the test on any uncaught page error or console error. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

export async function signUp(browser: Browser, name: string): Promise<{ page: Page; username: string; errors: string[] }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = watchErrors(page);
  const username = `${name}_${runId}`;
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTitle("Play-money balance")).toHaveText("$1,000.00");
  return { page, username, errors };
}

export const slip = (page: Page) => page.locator("aside[aria-label='Bet slip']");

/** Enabled odds buttons, one locator per game card. */
export const openOdds = (page: Page) =>
  page.locator("article").filter({ has: page.locator("button[aria-pressed]:not([disabled])") });

export async function balance(page: Page): Promise<string> {
  return page.getByTitle("Play-money balance").innerText();
}
