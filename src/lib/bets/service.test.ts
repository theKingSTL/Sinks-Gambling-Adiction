import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createSession, createUser, getSessionUser, verifyCredentials } from "@/lib/auth/core";
import { createDb, type Db } from "@/lib/db/client";
import { bets, ledger, posts, users } from "@/lib/db/schema";
import { buildMarkets } from "@/lib/nba/markets";
import type { Game } from "@/lib/nba/types";
import { placeBet, resetBankroll, settleOpenBets, type MarketResolver } from "./service";

const HOUR = 3_600_000;

function makeGame(id: string, over: Partial<Game> = {}): Game {
  return {
    id,
    startsAt: new Date(Date.now() + HOUR).toISOString(),
    state: "pre",
    completed: false,
    statusText: "7:30 PM",
    seasonType: 2,
    home: { id: `h${id}`, abbr: `H${id}`, name: `Home ${id}`, shortName: "Home", logo: null, color: null, score: null, record: null },
    away: { id: `a${id}`, abbr: `A${id}`, name: `Away ${id}`, shortName: "Away", logo: null, color: null, score: null, record: null },
    bookOdds: {
      provider: "Test Book",
      homeMoneyline: -150,
      awayMoneyline: 130,
      homeSpread: -3.5,
      homeSpreadPrice: -110,
      awaySpreadPrice: -110,
      total: 220.5,
      overPrice: -110,
      underPrice: -110,
    },
    ...over,
  };
}

let db: Db;
let userId: string;
let games: Map<string, Game>;

const resolver: MarketResolver = async (ids) =>
  new Map(
    ids.flatMap((id) => {
      const game = games.get(id);
      return game ? [[id, { game, markets: buildMarkets(game, () => undefined) }] as const] : [];
    }),
  );

const balance = () => db.select().from(users).where(eq(users.id, userId)).get()!.balanceCents;

const finish = (id: string, home: number, away: number) =>
  games.set(id, { ...games.get(id)!, state: "post", completed: true, home: { ...games.get(id)!.home, score: home }, away: { ...games.get(id)!.away, score: away } });

const fetchGame = async (id: string) => games.get(id) ?? null;
const later = () => Date.now() + 4 * HOUR;

beforeEach(async () => {
  db = createDb(":memory:");
  const res = await createUser(db, { username: "sink", displayName: "Sink", password: "password123" });
  if (!res.ok) throw new Error(res.error);
  userId = res.user.id;
  games = new Map([
    ["1", makeGame("1")],
    ["2", makeGame("2")],
  ]);
});

describe("auth", () => {
  it("starts with $1,000 and verifies credentials", async () => {
    expect(balance()).toBe(100_000);
    expect(await verifyCredentials(db, { username: "sink", password: "password123" })).toMatchObject({ id: userId });
    expect(await verifyCredentials(db, { username: "sink", password: "wrong-pass" })).toBeNull();
    expect(await verifyCredentials(db, { username: "nobody", password: "password123" })).toBeNull();
  });

  it("rejects duplicate usernames", async () => {
    expect(await createUser(db, { username: "sink", displayName: "X", password: "password123" })).toEqual({
      ok: false,
      error: "That username is taken",
    });
  });

  it("issues sessions that expire", () => {
    const { token } = createSession(db, userId, 0);
    expect(getSessionUser(db, token, 1000)?.id).toBe(userId);
    expect(getSessionUser(db, token, 31 * 24 * HOUR)).toBeNull();
    expect(getSessionUser(db, "forged", 1000)).toBeNull();
  });
});

describe("placeBet", () => {
  it("debits stake and records a parlay", async () => {
    const res = await placeBet(
      db,
      userId,
      {
        stakeCents: 10_000,
        legs: [
          { selectionId: "1:spread:home", price: -110, line: -3.5 },
          { selectionId: "2:total:over", price: -110, line: 220.5 },
        ],
      },
      resolver,
    );
    expect(res).toMatchObject({ ok: true, balanceCents: 90_000 });
    const bet = db.select().from(bets).get()!;
    expect(bet.potentialPayoutCents).toBe(36_446);
    expect(bet.price).toBe(264);
    expect(db.select().from(ledger).where(eq(ledger.kind, "stake")).get()?.amountCents).toBe(-10_000);
  });

  it("rejects moved lines and returns the new number", async () => {
    const res = await placeBet(
      db,
      userId,
      { stakeCents: 1_000, legs: [{ selectionId: "1:spread:home", price: -110, line: -2.5 }] },
      resolver,
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.changes?.[0].selection?.line).toBe(-3.5);
    expect(balance()).toBe(100_000);
  });

  it("rejects games that have started", async () => {
    games.set("1", makeGame("1", { state: "in" }));
    const res = await placeBet(db, userId, { stakeCents: 1_000, legs: [{ selectionId: "1:ml:home", price: -150, line: null }] }, resolver);
    expect(res).toMatchObject({ ok: false });
  });

  it("rejects two legs on the same game", async () => {
    const res = await placeBet(
      db,
      userId,
      {
        stakeCents: 1_000,
        legs: [
          { selectionId: "1:ml:home", price: -150, line: null },
          { selectionId: "1:total:over", price: -110, line: 220.5 },
        ],
      },
      resolver,
    );
    expect(res).toMatchObject({ ok: false });
  });

  it("never lets the balance go negative", async () => {
    const res = await placeBet(db, userId, { stakeCents: 100_001, legs: [{ selectionId: "1:ml:home", price: -150, line: null }] }, resolver);
    expect(res).toEqual({ ok: false, error: "Not enough play money for that stake" });
    expect(balance()).toBe(100_000);
  });

  it("validates stakes", async () => {
    const res = await placeBet(db, userId, { stakeCents: 50, legs: [{ selectionId: "1:ml:home", price: -150, line: null }] }, resolver);
    expect(res).toEqual({ ok: false, error: "Minimum stake is $1" });
  });
});

describe("settleOpenBets", () => {
  const parlay = () =>
    placeBet(
      db,
      userId,
      {
        stakeCents: 10_000,
        legs: [
          { selectionId: "1:ml:home", price: -150, line: null },
          { selectionId: "2:spread:away", price: -110, line: 3.5 },
        ],
      },
      resolver,
    );

  it("leaves bets open until every leg is decided", async () => {
    await parlay();
    finish("1", 110, 100);
    await settleOpenBets(db, fetchGame, later());
    expect(db.select().from(bets).get()?.status).toBe("open");
  });

  it("pays a winning parlay exactly once, even when run twice", async () => {
    await parlay();
    finish("1", 110, 100);
    finish("2", 101, 99); // away +3.5 covers
    await Promise.all([settleOpenBets(db, fetchGame, later()), settleOpenBets(db, fetchGame, later())]);
    await settleOpenBets(db, fetchGame, later());
    const bet = db.select().from(bets).get()!;
    // -150 (5/3) x -110 (21/11) on $100 = $318.18
    expect(bet).toMatchObject({ status: "won", payoutCents: 31_818 });
    expect(balance()).toBe(90_000 + 31_818);
  });

  it("settles a loss early without waiting for other legs", async () => {
    await parlay();
    finish("1", 90, 100);
    await settleOpenBets(db, fetchGame, later());
    expect(db.select().from(bets).get()).toMatchObject({ status: "lost", payoutCents: 0 });
    expect(balance()).toBe(90_000);
  });

  it("drops a pushed leg and re-prices the parlay", async () => {
    const g1 = games.get("1")!;
    games.set("1", { ...g1, bookOdds: { ...g1.bookOdds!, homeSpread: -3 } });
    await placeBet(
      db,
      userId,
      {
        stakeCents: 10_000,
        legs: [
          { selectionId: "1:spread:home", price: -110, line: -3 },
          { selectionId: "2:ml:away", price: 130, line: null },
        ],
      },
      resolver,
    );
    finish("1", 103, 100); // exactly 3 -> push
    finish("2", 99, 101);
    await settleOpenBets(db, fetchGame, later());
    expect(db.select().from(bets).get()).toMatchObject({ status: "won", payoutCents: 23_000 });
  });

  it("voids postponed games and refunds an all-push bet", async () => {
    await placeBet(
      db,
      userId,
      { stakeCents: 5_000, legs: [{ selectionId: "1:spread:home", price: -110, line: -3.5 }] },
      resolver,
    );
    games.set("1", { ...games.get("1")!, state: "post", completed: false, statusText: "Postponed" });
    await settleOpenBets(db, fetchGame, later());
    expect(db.select().from(bets).get()?.status).toBe("open"); // too soon to void
    await settleOpenBets(db, fetchGame, Date.now() + 50 * HOUR);
    expect(db.select().from(bets).get()).toMatchObject({ status: "push", payoutCents: 5_000 });
    expect(balance()).toBe(100_000);
  });
});

describe("resetBankroll", () => {
  it("only resets when busted, once per day", async () => {
    expect(resetBankroll(db, userId, "20261001")).toMatchObject({ ok: false });
    db.update(users).set({ balanceCents: 500 }).where(eq(users.id, userId)).run();
    expect(resetBankroll(db, userId, "20261001")).toEqual({ ok: true, balanceCents: 100_000 });
    db.update(users).set({ balanceCents: 0 }).where(eq(users.id, userId)).run();
    expect(resetBankroll(db, userId, "20261001")).toMatchObject({ ok: false });
    expect(resetBankroll(db, userId, "20261002")).toMatchObject({ ok: true });
  });
});

describe("tailing", () => {
  it("links a tail to the post", async () => {
    const placed = await placeBet(db, userId, { stakeCents: 1_000, legs: [{ selectionId: "1:ml:home", price: -150, line: null }] }, resolver);
    if (!placed.ok) throw new Error(placed.error);
    const post = db.insert(posts).values({ userId, betId: placed.betId, caption: "lock" }).returning().get();
    const tail = await placeBet(
      db,
      userId,
      { stakeCents: 1_000, tailedFromPostId: post.id, legs: [{ selectionId: "1:ml:home", price: -150, line: null }] },
      resolver,
    );
    expect(tail.ok).toBe(true);
    expect(db.select().from(bets).where(eq(bets.tailedFromPostId, post.id)).all()).toHaveLength(1);
  });
});
