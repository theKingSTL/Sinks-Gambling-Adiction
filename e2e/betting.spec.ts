import { expect, test } from "@playwright/test";
import { balance, openOdds, signUp, slip } from "./helpers";

test("slip, parlay, post, tail, follow, bets tabs, reset, logout/login", async ({ browser }) => {
  // --- Alice builds a parlay on the NFL slate
  const alice = await signUp(browser, "alice");
  const a = alice.page;
  await a.goto("/nfl");
  const games = openOdds(a);
  await expect(games.first()).toBeVisible();
  expect(await games.count()).toBeGreaterThan(1);

  const g1 = games.nth(0).locator("button[aria-pressed]");
  const g2 = games.nth(1).locator("button[aria-pressed]");

  // toggle on / off
  await g1.first().click();
  await expect(g1.first()).toHaveAttribute("aria-pressed", "true");
  await g1.first().click();
  await expect(g1.first()).toHaveAttribute("aria-pressed", "false");
  await expect(slip(a).getByText("Your slip is empty")).toBeVisible();

  // same game swaps; another game makes a parlay
  await g1.nth(0).click();
  await g1.nth(2).click();
  await expect(slip(a).getByText(/one pick per game/)).toBeVisible();
  await expect(g1.nth(0)).toHaveAttribute("aria-pressed", "false");
  await g2.nth(1).click();
  await expect(slip(a).getByRole("heading", { name: /Parlay · 2 legs/ })).toBeVisible();

  // remove + clear
  await slip(a).getByRole("button", { name: /^Remove / }).first().click();
  await expect(slip(a).getByRole("heading", { name: "Bet slip" })).toBeVisible();
  await slip(a).getByRole("button", { name: "Clear" }).click();
  await expect(slip(a).getByText("Your slip is empty")).toBeVisible();

  // build again, quick stake, place
  await g1.nth(0).click();
  await g2.nth(0).click();
  await slip(a).getByRole("button", { name: "$25", exact: true }).click();
  await expect(slip(a).getByLabel("Stake")).toHaveValue("25");
  await slip(a).getByRole("button", { name: "Place $25.00" }).click();
  await expect(slip(a).getByText("Bet placed")).toBeVisible();
  await expect.poll(() => balance(a)).toBe("$975.00");

  // post from the slip
  await slip(a).getByLabel("Post it so friends can tail").fill("Two-leg sweat, who's in?");
  await slip(a).getByRole("button", { name: "Post to feed" }).click();
  await expect(slip(a).getByText("Posted.")).toBeVisible();
  await slip(a).getByRole("button", { name: "Build another" }).click();
  await expect(slip(a).getByText("Your slip is empty")).toBeVisible();

  // straight bet, then post it from My bets
  await g1.nth(1).click();
  await slip(a).getByRole("button", { name: "$10", exact: true }).click();
  await slip(a).getByRole("button", { name: "Place $10.00" }).click();
  await expect(slip(a).getByText("Bet placed")).toBeVisible();
  await a.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My bets" }).click();
  await expect(a.getByRole("heading", { name: "My bets" })).toBeVisible();
  await expect(a.getByText("Straight")).toBeVisible();
  const main = a.getByRole("main");
  await main.getByRole("button", { name: "Post to feed" }).click();
  await main.getByLabel("Caption").fill("Single");
  await main.getByRole("button", { name: "Post", exact: true }).click();
  await expect(a.getByText("Posted", { exact: true }).first()).toBeVisible();
  await a.getByRole("tab", { name: "Settled" }).click();
  await expect(a.getByText("Nothing settled yet")).toBeVisible();
  await a.getByRole("tab", { name: /Open/ }).click();

  // --- Bob finds Alice, follows, tails
  const bob = await signUp(browser, "bob");
  const b = bob.page;
  await b.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Feed" }).click();
  await expect(b.getByText("Your feed is quiet")).toBeVisible();
  await b.getByLabel("Find friends").fill(alice.username);
  await b.getByRole("button", { name: "Search" }).click();
  await b.getByRole("main").getByRole("link", { name: new RegExp(`@${alice.username}`) }).click();
  await b.getByRole("button", { name: "Follow" }).click();
  await expect(b.getByRole("button", { name: "Following" })).toBeVisible();

  await b.goto("/feed");
  const post = b.locator("article").filter({ hasText: "Two-leg sweat" });
  await expect(post).toBeVisible();
  await post.getByRole("button", { name: "Tail this" }).click();
  await expect(slip(b).getByText("Tailing at current lines")).toBeVisible();
  await slip(b).getByRole("button", { name: "$10", exact: true }).click();
  await slip(b).getByRole("button", { name: "Place $10.00" }).click();
  await expect(slip(b).getByText("Bet placed")).toBeVisible();
  await b.reload();
  await expect(post.getByText("You tailed this")).toBeVisible();
  await expect(post.getByText("1 tail", { exact: false })).toBeVisible();

  // unfollow works too
  await b.goto(`/u/${alice.username}`);
  await b.getByRole("button", { name: "Following" }).click();
  await expect(b.getByRole("button", { name: "Follow" })).toBeVisible();

  // feed tabs + leaderboard
  await b.goto("/feed");
  await b.getByRole("tab", { name: "everyone" }).click();
  await expect(b).toHaveURL(/tab=everyone/);
  await b.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Leaders" }).click();
  await expect(b.getByRole("heading", { name: "Leaderboard" })).toBeVisible();

  // --- Bob goes all-in, then resets the bankroll
  await b.goto("/nfl");
  await openOdds(b).first().locator("button[aria-pressed]").first().click();
  await slip(b).getByLabel("Stake").fill("990");
  await slip(b).getByRole("button", { name: "Place $990.00" }).click();
  await expect(slip(b).getByText("Bet placed")).toBeVisible();
  await b.goto("/bets");
  await b.getByRole("button", { name: "Reset to $1,000" }).click();
  // The page refreshes with the new balance; the reset button disappears once you're funded again.
  await expect.poll(() => balance(b)).toBe("$1,000.00");
  await expect(b.getByRole("button", { name: "Reset to $1,000" })).toBeHidden();

  // --- log out and back in
  await b.getByRole("button", { name: "Log out" }).click();
  await expect(b.getByRole("link", { name: "Log in" })).toBeVisible();
  await b.getByRole("link", { name: "Log in" }).click();
  await b.getByLabel("Username").fill(bob.username);
  await b.getByLabel("Password").fill("wrong-password");
  await b.getByRole("button", { name: "Log in" }).click();
  await expect(b.locator("#form-error")).toHaveText("Wrong username or password");
  await b.getByLabel("Password").fill("password123");
  await b.getByRole("button", { name: "Log in" }).click();
  await expect(b.getByTitle("Play-money balance")).toBeVisible();

  expect(alice.errors).toEqual([]);
  expect(bob.errors).toEqual([]);
});
