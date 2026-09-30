import Link from "next/link";
import { tipoff } from "@/lib/format";
import type { Game, GameMarkets, Selection, TeamSide } from "@/lib/nba/types";
import { OddsButton } from "./odds-button";
import type { SlipLeg } from "./slip/slip-context";
import { TeamLogo } from "./team-logo";

export function toSlipLeg(sel: Selection, game: Game): SlipLeg {
  return { ...sel, matchup: `${game.away.abbr} @ ${game.home.abbr}`, startsAt: game.startsAt };
}

const fmt = (n: number | null) => (n === null ? "" : n > 0 ? `+${n}` : `${n}`);

export function StatusPill({ game }: { game: Game }) {
  if (game.state === "in") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-live">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
        LIVE · {game.statusText}
      </span>
    );
  }
  if (game.state === "post") return <span className="text-xs font-semibold text-muted">{game.statusText || "Final"}</span>;
  return <span className="text-xs text-muted">{tipoff(game.startsAt)}</span>;
}

function TeamRow({ team, winner, showScore }: { team: TeamSide; winner: boolean; showScore: boolean }) {
  return (
    <div className="flex h-12 items-center gap-3">
      <TeamLogo src={team.logo} abbr={team.abbr} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${showScore && !winner ? "text-muted" : ""}`}>{team.shortName || team.name}</p>
        {team.record && <p className="num text-xs text-faint">{team.record}</p>}
      </div>
      {showScore && (
        <span className={`display num text-2xl font-bold ${winner ? "" : "text-muted"}`}>{team.score ?? "–"}</span>
      )}
    </div>
  );
}

export function GameCard({ game, markets }: { game: Game; markets: GameMarkets | undefined }) {
  const showScore = game.state !== "pre";
  const homeWinning = (game.home.score ?? 0) >= (game.away.score ?? 0);
  const closed = !markets?.open;
  const source = markets?.moneyline?.[0];

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
      <div className="mb-2 flex items-center justify-between">
        <StatusPill game={game} />
        <Link href={`/games/${game.id}`} className="text-xs text-muted hover:text-text">
          Stats & box score →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,5.5rem)]">
        <div className="hidden sm:block" />
        {["Spread", "Total", "Money"].map((h) => (
          <p key={h} className="hidden pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-faint sm:block">
            {h}
          </p>
        ))}

        {(["away", "home"] as const).map((side, i) => {
          const team = game[side];
          const idx = side === "away" ? 0 : 1;
          const spread = markets?.spread?.[idx];
          const total = markets?.total?.[idx];
          const ml = markets?.moneyline?.[idx];
          return (
            <div key={side} className="contents">
              <TeamRow team={team} winner={side === "home" ? homeWinning : !homeWinning} showScore={showScore} />
              <div className={`grid grid-cols-3 gap-2 sm:contents ${i === 0 ? "mb-2 sm:mb-0" : ""}`}>
                {spread && <OddsButton leg={toSlipLeg(spread, game)} top={fmt(spread.line)} disabled={closed} />}
                {total && (
                  <OddsButton leg={toSlipLeg(total, game)} top={`${side === "away" ? "O" : "U"} ${total.line}`} disabled={closed} />
                )}
                {ml && <OddsButton leg={toSlipLeg(ml, game)} disabled={closed} />}
              </div>
            </div>
          );
        })}
      </div>

      {source && (
        <p className="mt-3 text-[11px] text-faint">
          {closed ? "Betting closed · " : ""}
          {source.source === "book" ? `Lines: ${source.provider}` : "House line — no book has posted this game yet"}
        </p>
      )}
    </article>
  );
}
