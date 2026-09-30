import Link from "next/link";
import { kickoff } from "@/lib/format";
import type { Game, GameMarkets, Prediction, Selection, TeamSide } from "@/lib/games/types";
import { SPORTS } from "@/lib/sports";
import { OddsButton } from "./odds-button";
import type { SlipLeg } from "./slip/slip-context";
import { TeamLogo } from "./team-logo";

export function toSlipLeg(sel: Selection, game: Game): SlipLeg {
  return {
    ...sel,
    matchup: `${SPORTS[game.sport].label} · ${game.away.abbr} @ ${game.home.abbr}`,
    startsAt: game.startsAt,
  };
}

export const gameHref = (game: Pick<Game, "sport" | "id">) => `/games/${game.sport}/${game.id}`;

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
  return <span className="text-xs text-muted">{kickoff(game.startsAt)}</span>;
}

function TeamRow({ team, winner, showScore }: { team: TeamSide; winner: boolean; showScore: boolean }) {
  return (
    <div className="flex h-12 items-center gap-3">
      <TeamLogo src={team.logo} abbr={team.abbr} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${showScore && !winner ? "text-muted" : ""}`}>
          {team.rank && <span className="num mr-1 text-xs text-faint">{team.rank}</span>}
          {team.shortName || team.name}
        </p>
        {team.record && <p className="num text-xs text-faint">{team.record}</p>}
      </div>
      {showScore && (
        <span className={`display num text-2xl font-bold ${winner ? "" : "text-muted"}`}>{team.score ?? "–"}</span>
      )}
    </div>
  );
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const SOURCE_LABEL = { market: "Market odds", model: "Sinks model", espn: "ESPN Matchup Predictor" } as const;

/** Win-probability bar with projected score. */
export function PredictionBar({ game, prediction, compact }: { game: Game; prediction: Prediction; compact?: boolean }) {
  const away = 1 - prediction.homeWinProb;
  const decimals = game.sport === "mlb" ? 1 : 0;
  const score = (n: number) => Math.max(0, n).toFixed(decimals);
  const awayFav = away > prediction.homeWinProb;
  return (
    <div className={compact ? "mt-3" : ""}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={awayFav ? "font-semibold text-text" : "text-muted"}>
          {game.away.abbr} <span className="num">{pct(away)}</span>
        </span>
        <span className="text-[11px] uppercase tracking-wider text-faint">
          Prediction · proj{" "}
          <span className="num normal-case">
            {score(prediction.awayScore)}–{score(prediction.homeScore)}
          </span>
        </span>
        <span className={!awayFav ? "font-semibold text-text" : "text-muted"}>
          <span className="num">{pct(prediction.homeWinProb)}</span> {game.home.abbr}
        </span>
      </div>
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-raised"
        role="img"
        aria-label={`Win probability: ${game.away.abbr} ${pct(away)}, ${game.home.abbr} ${pct(prediction.homeWinProb)} (${SOURCE_LABEL[prediction.source]})`}
      >
        <div className={awayFav ? "bg-accent" : "bg-line-strong"} style={{ width: pct(away) }} />
        <div className={!awayFav ? "bg-accent" : "bg-line-strong"} style={{ width: pct(prediction.homeWinProb) }} />
      </div>
      {!compact && <p className="mt-1 text-[11px] text-faint">Source: {SOURCE_LABEL[prediction.source]}</p>}
    </div>
  );
}

export function GameCard({ game, markets }: { game: Game; markets: GameMarkets | undefined }) {
  const showScore = game.state !== "pre";
  const homeWinning = (game.home.score ?? 0) >= (game.away.score ?? 0);
  const closed = !markets?.open;
  const source = markets?.moneyline?.[0];
  const spreadSource = markets?.spread?.[0];
  const spreadLabel = SPORTS[game.sport].spreadLabel;

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
      <div className="mb-2 flex items-center justify-between">
        <StatusPill game={game} />
        <Link href={gameHref(game)} className="text-xs text-muted hover:text-text">
          Stats & predictions →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,5.5rem)]">
        <div className="hidden sm:block" />
        {[spreadLabel, "Total", "Money"].map((h) => (
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

      {markets && game.state === "pre" && <PredictionBar game={game} prediction={markets.prediction} compact />}

      {source && (
        <p className="mt-3 text-[11px] text-faint">
          {closed ? "Betting closed · " : ""}
          {source.source === "book" || spreadSource?.source === "book"
            ? `Lines: ${source.source === "book" ? source.provider : spreadSource!.provider}${
                source.source !== spreadSource?.source ? " + house line" : ""
              }`
            : "House line — no book has posted this game yet"}
        </p>
      )}
    </article>
  );
}
