import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { signedMoney } from "@/lib/format";
import { getLeaderboard } from "@/lib/social/service";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const rows = getLeaderboard(db);
  const viewer = await getCurrentUser();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="display text-4xl font-extrabold">Leaderboard</h1>
        <p className="text-sm text-muted">All-time profit on settled bets.</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-14 text-center text-sm text-muted">
          No settled bets yet. The board fills in as games go final.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <th scope="col" className="w-12 py-3 pl-4 text-left font-medium">#</th>
                <th scope="col" className="py-3 text-left font-medium">Bettor</th>
                <th scope="col" className="py-3 text-right font-medium">W-L-P</th>
                <th scope="col" className="hidden py-3 text-right font-medium sm:table-cell">ROI</th>
                <th scope="col" className="py-3 pr-4 text-right font-medium">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className={`border-t border-line/60 ${r.userId === viewer?.id ? "bg-accent-soft" : ""}`}>
                  <td className="num py-3 pl-4 text-muted">{i + 1}</td>
                  <td className="py-3">
                    <Link href={`/u/${r.username}`} className="font-semibold hover:underline">
                      {r.displayName}
                    </Link>
                    <span className="ml-2 text-xs text-faint">@{r.username}</span>
                  </td>
                  <td className="num py-3 text-right text-muted">
                    {r.won}-{r.lost}-{r.push}
                  </td>
                  <td className="num hidden py-3 text-right text-muted sm:table-cell">
                    {r.roi === null ? "—" : `${(r.roi * 100).toFixed(1)}%`}
                  </td>
                  <td className={`num py-3 pr-4 text-right font-semibold ${r.profitCents >= 0 ? "text-win" : "text-loss"}`}>
                    {signedMoney(r.profitCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
