import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { settleBet, gradeLeg } from "@/lib/betting/grading";
import { parlayAmerican, payoutCents } from "@/lib/betting/odds";
import type { Db } from "@/lib/db/client";
import { betLegs, bets, ledger, posts, users } from "@/lib/db/schema";
import { allSelections, gameKey, parseSelectionId } from "@/lib/games/markets";
import type { Game, GameMarkets, Selection } from "@/lib/games/types";
import type { SportKey } from "@/lib/sports";

export const STARTING_BANKROLL_CENTS = 100_000; // $1,000 play money
export const RESET_THRESHOLD_CENTS = 1_000; // may reset below $10
export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 1_000_000;
export const MAX_LEGS = 10;

export const placeBetInput = z.object({
  legs: z
    .array(
      z.object({
        selectionId: z.string().max(64),
        price: z.number().int(),
        line: z.number().nullable(),
      }),
    )
    .min(1, "Add at least one pick")
    .max(MAX_LEGS, `Parlays max out at ${MAX_LEGS} legs`),
  stakeCents: z
    .number()
    .int()
    .min(MIN_STAKE_CENTS, "Minimum stake is $1")
    .max(MAX_STAKE_CENTS, "Maximum stake is $10,000"),
  tailedFromPostId: z.string().uuid().optional(),
});
export type PlaceBetInput = z.infer<typeof placeBetInput>;

export type LineChange = { selectionId: string; selection: Selection | null };

export type PlaceBetResult =
  | { ok: true; betId: string; balanceCents: number }
  | { ok: false; error: string; changes?: LineChange[] };

export type GameRef = { sport: SportKey; gameId: string };

/** Live game + markets, keyed by `gameKey(sport, gameId)`. */
export type MarketResolver = (games: GameRef[]) => Promise<Map<string, { game: Game; markets: GameMarkets }>>;

/**
 * Place a straight bet or parlay. The client sends the price and line it saw;
 * if the live line differs, the bet is rejected with the new numbers so the
 * user can accept them. Balance is debited atomically.
 */
export async function placeBet(
  db: Db,
  userId: string,
  raw: unknown,
  resolve: MarketResolver,
): Promise<PlaceBetResult> {
  const parsed = placeBetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid bet" };
  const input = parsed.data;

  const keys = input.legs.map((l) => parseSelectionId(l.selectionId));
  if (keys.some((k) => k === null)) return { ok: false, error: "Unknown selection" };
  const refs = keys.map((k) => ({ sport: k!.sport, gameId: k!.gameId }));
  if (new Set(refs.map((r) => gameKey(r.sport, r.gameId))).size !== refs.length) {
    return { ok: false, error: "One pick per game — same-game parlays aren't supported yet" };
  }

  if (input.tailedFromPostId) {
    const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, input.tailedFromPostId)).get();
    if (!post) return { ok: false, error: "That post no longer exists" };
  }

  const live = await resolve(refs);
  const changes: LineChange[] = [];
  const picked: { selection: Selection; game: Game }[] = [];
  for (const leg of input.legs) {
    const key = parseSelectionId(leg.selectionId)!;
    const entry = live.get(gameKey(key.sport, key.gameId));
    if (!entry || !entry.markets.open) {
      return { ok: false, error: `${entry ? "That game has started" : "Game not found"} — remove it from your slip` };
    }
    const current = allSelections(entry.markets).find((s) => s.id === leg.selectionId) ?? null;
    if (!current || current.price !== leg.price || current.line !== leg.line) {
      changes.push({ selectionId: leg.selectionId, selection: current });
    } else {
      picked.push({ selection: current, game: entry.game });
    }
  }
  if (changes.length > 0) return { ok: false, error: "Lines moved — review the new odds", changes };

  const prices = picked.map((p) => p.selection.price);
  const potential = payoutCents(input.stakeCents, prices);
  const combined = prices.length === 1 ? prices[0] : parlayAmerican(prices);

  // better-sqlite3 transactions are synchronous and serialized: the guarded
  // debit below can't interleave with another bet or a settlement credit.
  return db.transaction((tx) => {
    const debit = tx
      .update(users)
      .set({ balanceCents: sql`${users.balanceCents} - ${input.stakeCents}` })
      .where(and(eq(users.id, userId), sql`${users.balanceCents} >= ${input.stakeCents}`))
      .run();
    if (debit.changes !== 1) return { ok: false as const, error: "Not enough play money for that stake" };

    const bet = tx
      .insert(bets)
      .values({
        userId,
        stakeCents: input.stakeCents,
        price: combined,
        potentialPayoutCents: potential,
        tailedFromPostId: input.tailedFromPostId ?? null,
      })
      .returning({ id: bets.id })
      .get();

    tx.insert(betLegs)
      .values(
        picked.map(({ selection, game }) => ({
          betId: bet.id,
          sport: game.sport,
          gameId: game.id,
          market: selection.market,
          side: selection.side,
          line: selection.line,
          price: selection.price,
          label: selection.label,
          matchup: `${game.away.abbr} @ ${game.home.abbr}`,
          startsAt: new Date(game.startsAt),
          source: selection.source,
        })),
      )
      .run();

    tx.insert(ledger).values({ userId, amountCents: -input.stakeCents, kind: "stake", betId: bet.id }).run();
    const { balanceCents } = tx.select({ balanceCents: users.balanceCents }).from(users).where(eq(users.id, userId)).get()!;
    return { ok: true as const, betId: bet.id, balanceCents };
  });
}

/** Postponed/cancelled games that never finish are voided (pushed) after this long. */
const VOID_AFTER_MS = 48 * 3_600_000;

/**
 * Grade every open leg whose game has finished, then settle any bet that is
 * now decided. Safe to run concurrently or repeatedly: each write is guarded
 * on the row still being open, so a bet is paid exactly once.
 */
export async function settleOpenBets(
  db: Db,
  fetchGame: (sport: SportKey, id: string) => Promise<Game | null>,
  now = Date.now(),
): Promise<{ settled: number }> {
  const openGames = db
    .selectDistinct({ sport: betLegs.sport, gameId: betLegs.gameId })
    .from(betLegs)
    .where(and(eq(betLegs.status, "open"), lt(betLegs.startsAt, new Date(now))))
    .all();
  if (openGames.length === 0) return { settled: 0 };

  const games = await Promise.all(
    openGames.map(({ sport, gameId }) =>
      fetchGame(sport, gameId).catch((err) => {
        console.error(`[settle] could not load ${sport} game ${gameId}`, err);
        return null;
      }),
    ),
  );

  const touchedBets = new Set<string>();
  for (const [i, { sport, gameId }] of openGames.entries()) {
    const game = games[i];
    const legs = db
      .select()
      .from(betLegs)
      .where(and(eq(betLegs.sport, sport), eq(betLegs.gameId, gameId), eq(betLegs.status, "open")))
      .all();

    for (const leg of legs) {
      let result: "won" | "lost" | "push" | null = null;
      if (game?.completed && game.home.score !== null && game.away.score !== null) {
        result = gradeLeg(leg, { home: game.home.score, away: game.away.score });
      } else if (game && game.state !== "in" && now - leg.startsAt.getTime() > VOID_AFTER_MS) {
        result = "push";
      }
      if (!result) continue;
      const res = db
        .update(betLegs)
        .set({ status: result })
        .where(and(eq(betLegs.id, leg.id), eq(betLegs.status, "open")))
        .run();
      if (res.changes === 1) touchedBets.add(leg.betId);
    }
  }

  let settled = 0;
  for (const betId of touchedBets) if (settleOne(db, betId, now)) settled++;
  return { settled };
}

function settleOne(db: Db, betId: string, now: number): boolean {
  return db.transaction((tx) => {
    const bet = tx.select().from(bets).where(eq(bets.id, betId)).get();
    if (!bet || bet.status !== "open") return false;
    const legs = tx.select().from(betLegs).where(eq(betLegs.betId, betId)).all();
    const outcome = settleBet(
      bet.stakeCents,
      legs.map((l) => ({ price: l.price, result: l.status })),
    );
    if (outcome.status === "open") return false;

    const upd = tx
      .update(bets)
      .set({ status: outcome.status, payoutCents: outcome.payoutCents, settledAt: new Date(now) })
      .where(and(eq(bets.id, betId), eq(bets.status, "open")))
      .run();
    if (upd.changes !== 1) return false;

    if (outcome.payoutCents > 0) {
      tx.update(users)
        .set({ balanceCents: sql`${users.balanceCents} + ${outcome.payoutCents}` })
        .where(eq(users.id, bet.userId))
        .run();
      tx.insert(ledger)
        .values({ userId: bet.userId, amountCents: outcome.payoutCents, kind: "payout", betId })
        .run();
    }
    return true;
  });
}

export type ResetResult = { ok: true; balanceCents: number } | { ok: false; error: string };

/** Busted? Refill to the starting bankroll, once per day. */
export function resetBankroll(db: Db, userId: string, today: string): ResetResult {
  return db.transaction((tx) => {
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return { ok: false as const, error: "Not signed in" };
    if (user.balanceCents >= RESET_THRESHOLD_CENTS) {
      return { ok: false as const, error: "Resets unlock when your balance is under $10" };
    }
    if (user.lastResetDay === today) return { ok: false as const, error: "One reset per day — back tomorrow" };
    const delta = STARTING_BANKROLL_CENTS - user.balanceCents;
    tx.update(users)
      .set({ balanceCents: STARTING_BANKROLL_CENTS, lastResetDay: today })
      .where(eq(users.id, userId))
      .run();
    tx.insert(ledger).values({ userId, amountCents: delta, kind: "reset" }).run();
    return { ok: true as const, balanceCents: STARTING_BANKROLL_CENTS };
  });
}

/** Legs for a set of bets, grouped by bet id. */
export function legsByBet(db: Db, betIds: string[]) {
  const map = new Map<string, (typeof betLegs.$inferSelect)[]>();
  if (betIds.length === 0) return map;
  for (const leg of db.select().from(betLegs).where(inArray(betLegs.betId, betIds)).all()) {
    const list = map.get(leg.betId) ?? [];
    list.push(leg);
    map.set(leg.betId, list);
  }
  return map;
}
