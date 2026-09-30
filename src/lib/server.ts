import "server-only";
import { settleOpenBets, type MarketResolver } from "@/lib/bets/service";
import { db } from "@/lib/db";
import { getGame, getMarketsForGame } from "@/lib/games/espn";
import { gameKey } from "@/lib/games/markets";

/** Live markets for the games in a slip, straight from the feed. */
export const resolveMarkets: MarketResolver = async (refs) => {
  const entries = await Promise.all(
    refs.map(async ({ sport, gameId }) => {
      const game = await getGame(sport, gameId);
      return game ? ([gameKey(sport, gameId), { game, markets: await getMarketsForGame(game) }] as const) : null;
    }),
  );
  return new Map(entries.filter((e) => e !== null));
};

const SETTLE_EVERY_MS = 30_000;
const globalForSettle = globalThis as unknown as { lastSettle?: number; settling?: Promise<unknown> };

/**
 * Opportunistic settlement: pages call this so results land without a
 * scheduler. Throttled, and concurrent callers share one in-flight run.
 * The cron route calls settleOpenBets directly for guaranteed cadence.
 */
export async function maybeSettle(): Promise<void> {
  const now = Date.now();
  if (globalForSettle.settling) {
    await globalForSettle.settling;
    return;
  }
  if (globalForSettle.lastSettle && now - globalForSettle.lastSettle < SETTLE_EVERY_MS) return;
  globalForSettle.lastSettle = now;
  globalForSettle.settling = settleOpenBets(db, getGame)
    .catch((err) => console.error("[settle] failed", err))
    .finally(() => {
      globalForSettle.settling = undefined;
    });
  await globalForSettle.settling;
}
