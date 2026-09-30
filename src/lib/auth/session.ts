import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { createSession, deleteSession, getSessionUser, type PublicUser } from "./core";

const COOKIE = "sinks_session";

/** Per-request memoized: many components can ask without extra queries. */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  return getSessionUser(db, token);
});

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = createSession(db, userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Browsers drop Secure cookies on plain-HTTP origins (e.g. http://192.168.x.x:3000),
    // which would sign the user in and immediately lose the session.
    secure: await isHttps(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function isHttps(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return (h.get("origin") ?? h.get("referer") ?? "").startsWith("https://");
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) deleteSession(db, token);
  jar.delete(COOKIE);
}
