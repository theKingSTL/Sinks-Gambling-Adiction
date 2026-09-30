import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth/core";
import { createDb, type Db } from "@/lib/db/client";
import { betLegs, bets } from "@/lib/db/schema";
import { createPost, getFeed, getLeaderboard, getStats, setFollow } from "./service";

let db: Db;
let alice: string;
let bob: string;

async function user(username: string) {
  const res = await createUser(db, { username, displayName: username, password: "password123" });
  if (!res.ok) throw new Error(res.error);
  return res.user.id;
}

function bet(userId: string, status: "open" | "won" | "lost", stake: number, payout: number | null) {
  const b = db
    .insert(bets)
    .values({ userId, stakeCents: stake, price: 100, potentialPayoutCents: stake * 2, status, payoutCents: payout })
    .returning()
    .get();
  db.insert(betLegs)
    .values({ betId: b.id, gameId: "1", market: "ml", side: "home", line: null, price: 100, label: "BOS ML", matchup: "NY @ BOS", startsAt: new Date(), source: "house" })
    .run();
  return b.id;
}

beforeEach(async () => {
  db = createDb(":memory:");
  alice = await user("alice");
  bob = await user("bob");
});

describe("posts and feed", () => {
  it("only lets owners post their bets, once", () => {
    const id = bet(alice, "open", 1_000, null);
    expect(createPost(db, bob, { betId: id, caption: "mine" })).toMatchObject({ ok: false });
    expect(createPost(db, alice, { betId: id, caption: "lock of the day" })).toMatchObject({ ok: true });
    expect(createPost(db, alice, { betId: id, caption: "again" })).toEqual({ ok: false, error: "Already posted" });
  });

  it("scopes the following feed to people you follow", () => {
    createPost(db, alice, { betId: bet(alice, "open", 1_000, null), caption: "a" });
    expect(getFeed(db, { viewerId: bob, scope: "following" })).toHaveLength(0);
    expect(getFeed(db, { viewerId: bob, scope: "everyone" })).toHaveLength(1);
    setFollow(db, bob, alice, true);
    const feed = getFeed(db, { viewerId: bob, scope: "following" });
    expect(feed).toHaveLength(1);
    expect(feed[0].legs[0].label).toBe("BOS ML");
  });

  it("counts tails", () => {
    const res = createPost(db, alice, { betId: bet(alice, "open", 1_000, null), caption: "" });
    if (!res.ok) throw new Error(res.error);
    const tail = bet(bob, "open", 500, null);
    db.update(bets).set({ tailedFromPostId: res.postId }).where(eq(bets.id, tail)).run();
    const [item] = getFeed(db, { viewerId: bob, scope: "everyone" });
    expect(item.tails).toBe(1);
    expect(item.tailedByViewer).toBe(true);
  });
});

describe("stats", () => {
  it("computes record, profit and ROI from settled bets", () => {
    bet(alice, "won", 1_000, 2_500);
    bet(alice, "lost", 1_000, 0);
    bet(alice, "open", 5_000, null);
    expect(getStats(db, alice)).toEqual({ won: 1, lost: 1, push: 0, open: 1, profitCents: 500, roi: 0.25 });
  });

  it("ranks the leaderboard by profit", () => {
    bet(alice, "won", 1_000, 2_000);
    bet(bob, "won", 1_000, 5_000);
    expect(getLeaderboard(db).map((r) => r.username)).toEqual(["bob", "alice"]);
  });
});
