import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Play money, integer cents. Never negative (enforced in the bet service). */
  balanceCents: integer("balance_cents").notNull(),
  /** Day key (YYYYMMDD) of the last bankroll reset, to allow one per day. */
  lastResetDay: text("last_reset_day"),
  createdAt: createdAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the cookie token — a leaked DB can't be replayed as sessions. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const follows = sqliteTable(
  "follows",
  {
    followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index("follows_followee_idx").on(t.followeeId)],
);

export type BetStatus = "open" | "won" | "lost" | "push";

export const bets = sqliteTable(
  "bets",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stakeCents: integer("stake_cents").notNull(),
    /** Combined American price at placement. */
    price: integer("price").notNull(),
    potentialPayoutCents: integer("potential_payout_cents").notNull(),
    status: text("status").$type<BetStatus>().notNull().default("open"),
    payoutCents: integer("payout_cents"),
    tailedFromPostId: text("tailed_from_post_id"),
    placedAt: createdAt(),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("bets_user_idx").on(t.userId, t.placedAt), index("bets_status_idx").on(t.status)],
);

export type LegStatus = "open" | "won" | "lost" | "push";

export const betLegs = sqliteTable(
  "bet_legs",
  {
    id: id(),
    betId: text("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    market: text("market").$type<"ml" | "spread" | "total">().notNull(),
    side: text("side").$type<"home" | "away" | "over" | "under">().notNull(),
    line: real("line"),
    price: integer("price").notNull(),
    label: text("label").notNull(),
    /** "NY @ BOS" snapshot so history renders without the feed. */
    matchup: text("matchup").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source").$type<"book" | "house">().notNull(),
    status: text("status").$type<LegStatus>().notNull().default("open"),
  },
  (t) => [index("legs_bet_idx").on(t.betId), index("legs_open_idx").on(t.status, t.gameId)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    betId: text("bet_id").notNull().references(() => bets.id, { onDelete: "cascade" }),
    caption: text("caption").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("posts_bet_unique").on(t.betId), index("posts_created_idx").on(t.createdAt)],
);

export type LedgerKind = "signup" | "stake" | "payout" | "reset";

/** Append-only record of every balance change — the audit trail for play money. */
export const ledger = sqliteTable(
  "ledger",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind").$type<LedgerKind>().notNull(),
    betId: text("bet_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type BetLeg = typeof betLegs.$inferSelect;
