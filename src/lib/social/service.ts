import { and, count, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { legsByBet } from "@/lib/bets/service";
import type { Db } from "@/lib/db/client";
import { bets, follows, posts, users, type Bet, type BetLeg } from "@/lib/db/schema";

export const postInput = z.object({
  betId: z.string().uuid(),
  caption: z.string().trim().max(280, "Keep it under 280 characters"),
});

export function createPost(db: Db, userId: string, raw: unknown): { ok: true; postId: string } | { ok: false; error: string } {
  const parsed = postInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid post" };
  const bet = db.select().from(bets).where(eq(bets.id, parsed.data.betId)).get();
  if (!bet || bet.userId !== userId) return { ok: false, error: "You can only post your own bets" };
  const existing = db.select({ id: posts.id }).from(posts).where(eq(posts.betId, bet.id)).get();
  if (existing) return { ok: false, error: "Already posted" };
  const post = db.insert(posts).values({ userId, betId: bet.id, caption: parsed.data.caption }).returning().get();
  return { ok: true, postId: post.id };
}

export function setFollow(db: Db, followerId: string, followeeId: string, follow: boolean): void {
  if (followerId === followeeId) return;
  if (follow) {
    db.insert(follows).values({ followerId, followeeId }).onConflictDoNothing().run();
  } else {
    db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId))).run();
  }
}

export function isFollowing(db: Db, followerId: string, followeeId: string): boolean {
  return !!db
    .select({ f: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .get();
}

export type FeedItem = {
  postId: string;
  caption: string;
  createdAt: Date;
  author: { id: string; username: string; displayName: string };
  bet: Bet;
  legs: BetLeg[];
  tails: number;
  tailedByViewer: boolean;
};

export function getFeed(
  db: Db,
  opts: { viewerId: string | null; scope: "following" | "everyone"; authorId?: string; postId?: string; limit?: number },
): FeedItem[] {
  const filters = [];
  if (opts.postId) filters.push(eq(posts.id, opts.postId));
  if (opts.authorId) filters.push(eq(posts.userId, opts.authorId));
  if (opts.scope === "following" && opts.viewerId) {
    const followees = db
      .select({ id: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, opts.viewerId));
    filters.push(or(eq(posts.userId, opts.viewerId), inArray(posts.userId, followees)));
  }

  const rows = db
    .select({
      postId: posts.id,
      caption: posts.caption,
      createdAt: posts.createdAt,
      authorId: users.id,
      username: users.username,
      displayName: users.displayName,
      bet: bets,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .innerJoin(bets, eq(bets.id, posts.betId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 50)
    .all();
  if (rows.length === 0) return [];

  const postIds = rows.map((r) => r.postId);
  const tailCounts = new Map(
    db
      .select({ postId: bets.tailedFromPostId, n: count() })
      .from(bets)
      .where(inArray(bets.tailedFromPostId, postIds))
      .groupBy(bets.tailedFromPostId)
      .all()
      .map((r) => [r.postId, r.n]),
  );
  const viewerTails = new Set(
    opts.viewerId
      ? db
          .select({ postId: bets.tailedFromPostId })
          .from(bets)
          .where(and(eq(bets.userId, opts.viewerId), inArray(bets.tailedFromPostId, postIds)))
          .all()
          .map((r) => r.postId)
      : [],
  );
  const legs = legsByBet(db, rows.map((r) => r.bet.id));

  return rows.map((r) => ({
    postId: r.postId,
    caption: r.caption,
    createdAt: r.createdAt,
    author: { id: r.authorId, username: r.username, displayName: r.displayName },
    bet: r.bet,
    legs: legs.get(r.bet.id) ?? [],
    tails: tailCounts.get(r.postId) ?? 0,
    tailedByViewer: viewerTails.has(r.postId),
  }));
}

export type BettorStats = { won: number; lost: number; push: number; open: number; profitCents: number; roi: number | null };

const statsSelect = {
  won: sql<number>`sum(case when ${bets.status} = 'won' then 1 else 0 end)`,
  lost: sql<number>`sum(case when ${bets.status} = 'lost' then 1 else 0 end)`,
  push: sql<number>`sum(case when ${bets.status} = 'push' then 1 else 0 end)`,
  open: sql<number>`sum(case when ${bets.status} = 'open' then 1 else 0 end)`,
  settledStake: sql<number>`sum(case when ${bets.status} != 'open' then ${bets.stakeCents} else 0 end)`,
  returned: sql<number>`sum(coalesce(${bets.payoutCents}, 0))`,
};

function toStats(r: { won: number | null; lost: number | null; push: number | null; open: number | null; settledStake: number | null; returned: number | null }): BettorStats {
  const settledStake = r.settledStake ?? 0;
  const profitCents = (r.returned ?? 0) - settledStake;
  return {
    won: r.won ?? 0,
    lost: r.lost ?? 0,
    push: r.push ?? 0,
    open: r.open ?? 0,
    profitCents,
    roi: settledStake > 0 ? profitCents / settledStake : null,
  };
}

export function getStats(db: Db, userId: string): BettorStats {
  return toStats(db.select(statsSelect).from(bets).where(eq(bets.userId, userId)).get()!);
}

export type LeaderboardRow = BettorStats & { userId: string; username: string; displayName: string };

export function getLeaderboard(db: Db, limit = 50): LeaderboardRow[] {
  return db
    .select({ ...statsSelect, userId: users.id, username: users.username, displayName: users.displayName })
    .from(bets)
    .innerJoin(users, eq(users.id, bets.userId))
    .where(ne(bets.status, "open"))
    .groupBy(users.id)
    .all()
    .map((r) => ({ ...toStats(r), userId: r.userId, username: r.username, displayName: r.displayName }))
    .sort((a, b) => b.profitCents - a.profitCents)
    .slice(0, limit);
}

export function getFollowCounts(db: Db, userId: string) {
  const followers = db.select({ n: count() }).from(follows).where(eq(follows.followeeId, userId)).get()?.n ?? 0;
  const following = db.select({ n: count() }).from(follows).where(eq(follows.followerId, userId)).get()?.n ?? 0;
  return { followers, following };
}

export function getUserBets(db: Db, userId: string, limit = 100) {
  const rows = db.select().from(bets).where(eq(bets.userId, userId)).orderBy(desc(bets.placedAt)).limit(limit).all();
  const legs = legsByBet(db, rows.map((r) => r.id));
  const postedIds = new Set(
    rows.length
      ? db.select({ betId: posts.betId }).from(posts).where(inArray(posts.betId, rows.map((r) => r.id))).all().map((r) => r.betId)
      : [],
  );
  return rows.map((bet) => ({ bet, legs: legs.get(bet.id) ?? [], posted: postedIds.has(bet.id) }));
}

export function searchUsers(db: Db, q: string, limit = 20) {
  const term = `%${q.trim().toLowerCase().replace(/[%_]/g, "")}%`;
  return db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(or(sql`lower(${users.username}) like ${term}`, sql`lower(${users.displayName}) like ${term}`))
    .limit(limit)
    .all();
}
