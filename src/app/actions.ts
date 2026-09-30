"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { credentialsSchema, createUser, signupSchema, verifyCredentials } from "@/lib/auth/core";
import { endSession, getCurrentUser, startSession } from "@/lib/auth/session";
import { placeBet, resetBankroll, type PlaceBetResult } from "@/lib/bets/service";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { dayKey } from "@/lib/games/espn";
import { rateLimit } from "@/lib/rate-limit";
import { resolveMarkets } from "@/lib/server";
import { createPost, setFollow } from "@/lib/social/service";
import { eq } from "drizzle-orm";

/** Echoes back non-secret fields so a failed submit doesn't wipe what the user typed. */
export type FormState = { error?: string; username?: string; displayName?: string } | undefined;

const echo = (form: FormData) => ({
  username: String(form.get("username") ?? "").slice(0, 40),
  displayName: String(form.get("displayName") ?? "").slice(0, 40),
});

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
}

/** Only follow same-site relative redirects, never an attacker-supplied URL. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000)) return { error: "Too many sign-ups — try later", ...echo(form) };
  const parsed = signupSchema.safeParse({
    username: form.get("username"),
    displayName: form.get("displayName"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, ...echo(form) };
  const res = await createUser(db, parsed.data);
  if (!res.ok) return { error: res.error, ...echo(form) };
  await startSession(res.user.id);
  redirect(safeNext(form.get("next")));
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({ username: form.get("username"), password: form.get("password") });
  if (!parsed.success) return { error: "Wrong username or password", ...echo(form) };
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}:${parsed.data.username}`, 8, 15 * 60_000)) {
    return { error: "Too many attempts — wait a few minutes", ...echo(form) };
  }
  const user = await verifyCredentials(db, parsed.data);
  if (!user) return { error: "Wrong username or password", ...echo(form) };
  await startSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function placeBetAction(input: unknown): Promise<PlaceBetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to place bets" };
  if (!rateLimit(`bet:${user.id}`, 30, 60_000)) return { ok: false, error: "Slow down a little" };
  const res = await placeBet(db, user.id, input, resolveMarkets);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function postBetAction(input: { betId: string; caption: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  if (!rateLimit(`post:${user.id}`, 20, 60_000)) return { ok: false, error: "Slow down a little" };
  const res = createPost(db, user.id, input);
  if (!res.ok) return res;
  revalidatePath("/feed");
  revalidatePath("/bets");
  return { ok: true };
}

export async function followAction(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const username = String(form.get("username") ?? "");
  const target = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (!target) return;
  setFollow(db, user.id, target.id, form.get("follow") === "1");
  revalidatePath(`/u/${username}`);
  revalidatePath("/feed");
}

export async function resetBankrollAction(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const res = resetBankroll(db, user.id, dayKey(new Date()));
  if (res.ok) revalidatePath("/", "layout");
  return res.ok ? { ok: true } : res;
}
