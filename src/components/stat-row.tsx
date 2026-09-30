import type { BettorStats } from "@/lib/social/service";
import { signedMoney } from "@/lib/format";

export function StatRow({ stats }: { stats: BettorStats }) {
  const cells = [
    { label: "Record", value: `${stats.won}-${stats.lost}${stats.push ? `-${stats.push}` : ""}` },
    {
      label: "Profit",
      value: signedMoney(stats.profitCents),
      tone: stats.profitCents > 0 ? "text-win" : stats.profitCents < 0 ? "text-loss" : "",
    },
    { label: "ROI", value: stats.roi === null ? "—" : `${(stats.roi * 100).toFixed(1)}%` },
    { label: "Open", value: String(stats.open) },
  ];
  return (
    <dl className="grid grid-cols-4 divide-x divide-line rounded-2xl border border-line bg-surface">
      {cells.map((c) => (
        <div key={c.label} className="px-3 py-3 text-center">
          <dt className="text-[11px] uppercase tracking-wider text-faint">{c.label}</dt>
          <dd className={`num mt-0.5 text-lg font-semibold ${c.tone ?? ""}`}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}
