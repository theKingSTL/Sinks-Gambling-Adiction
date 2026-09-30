import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { STARTING_BANKROLL_CENTS } from "@/lib/bets/service";
import type { Db } from "@/lib/db/client";
import { ledger, sessions, users, type User } from "@/lib/db/schema";

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const BCRYPT_COST = 12;
// Compared against when the username doesn't exist, so response time doesn't leak which usernames are taken.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_COST);

export const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "Username: 3–20 letters, numbers or underscores"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, "Add a display name").max(40),
});

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "balanceCents">;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createUser(
  db: Db,
  input: z.infer<typeof signupSchema>,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const user = db.transaction((tx) => {
      const u = tx
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          balanceCents: STARTING_BANKROLL_CENTS,
        })
        .returning()
        .get();
      tx.insert(ledger).values({ userId: u.id, amountCents: STARTING_BANKROLL_CENTS, kind: "signup" }).run();
      return u;
    });
    return { ok: true, user: toPublic(user) };
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed: users.username/.test(err.message)) {
      return { ok: false, error: "That username is taken" };
    }
    throw err;
  }
}

export async function verifyCredentials(db: Db, input: z.infer<typeof credentialsSchema>): Promise<PublicUser | null> {
  const user = db.select().from(users).where(eq(users.username, input.username)).get();
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? toPublic(user) : null;
}

/** Returns the raw token for the cookie; only its hash is stored. */
export function createSession(db: Db, userId: string, now = Date.now()): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();
  return { token, expiresAt };
}

export function getSessionUser(db: Db, token: string | undefined, now = Date.now()): PublicUser | null {
  if (!token) return null;
  const row = db
    .select({ id: users.id, username: users.username, displayName: users.displayName, balanceCents: users.balanceCents })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date(now))))
    .get();
  return row ?? null;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, balanceCents: u.balanceCents };
}
