import { timingSafeEqual } from "node:crypto";
import { settleOpenBets } from "@/lib/bets/service";
import { db } from "@/lib/db";
import { getGame } from "@/lib/nba/espn";

/** Hit on a schedule (e.g. every 5 min) with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const authorized =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!authorized) return Response.json({ error: "unauthorized" }, { status: 401 });
  const result = await settleOpenBets(db, getGame);
  return Response.json(result);
}
