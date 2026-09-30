import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { GameCard, PredictionBar, StatusPill } from "@/components/game-card";
import { TeamLogo } from "@/components/team-logo";
import { getGameDetail, getMarketsForGame } from "@/lib/games/espn";
import type { BoxGroup, BoxTeam } from "@/lib/games/parse";
import { isSportKey, SPORTS } from "@/lib/sports";

export async function generateMetadata({ params }: PageProps<"/games/[sport]/[id]">): Promise<Metadata> {
  const { sport, id } = await params;
  if (!isSportKey(sport)) return { title: "Game" };
  const detail = await getGameDetail(sport, id).catch(() => null);
  return { title: detail ? `${detail.game.away.abbr} @ ${detail.game.home.abbr}` : "Game" };
}

export default async function GamePage({ params }: PageProps<"/games/[sport]/[id]">) {
  const { sport, id } = await params;
  if (!isSportKey(sport)) notFound();
  const detail = await getGameDetail(sport, id);
  if (!detail) notFound();
  const { game, box, teamStats, leaders, espnPrediction } = detail;
  const markets = await getMarketsForGame(game);

  const statsFor = (teamId: string) => new Map(teamStats.find((t) => t.teamId === teamId)?.stats.map((s) => [s.label, s.value]));
  const awayStats = statsFor(game.away.id);
  const homeStats = statsFor(game.home.id);
  const compare = [...awayStats.keys()].filter((k) => homeStats.has(k)).slice(0, 14);

  return (
    <div className="space-y-6">
      {game.state === "in" && <AutoRefresh seconds={20} />}
      <Link href={`/${sport}`} className="text-sm text-muted hover:text-text">
        ← All {SPORTS[sport].label} games
      </Link>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="mb-4 text-center">
          <StatusPill game={game} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {[game.away, null, game.home].map((team) =>
            team ? (
              <div key={team.id} className="flex flex-col items-center gap-2">
                <TeamLogo src={team.logo} abbr={team.abbr} size={64} />
                <p className="text-center font-semibold">
                  {team.rank && <span className="num mr-1 text-sm text-faint">{team.rank}</span>}
                  {team.name}
                </p>
                {team.record && <p className="num text-xs text-faint">{team.record}</p>}
              </div>
            ) : (
              <div key="score" className="display num text-center text-5xl font-extrabold sm:text-6xl">
                {game.state === "pre" ? (
                  <span className="text-2xl text-muted">vs</span>
                ) : (
                  <>
                    {game.away.score}
                    <span className="mx-3 text-faint">–</span>
                    {game.home.score}
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="prediction" className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <h2 id="prediction" className="display text-xl font-bold">
          Prediction
        </h2>
        <PredictionBar game={game} prediction={markets.prediction} />
        {espnPrediction && (
          <PredictionBar
            game={game}
            prediction={{ ...markets.prediction, homeWinProb: espnPrediction.homeWinProb, source: "espn" }}
          />
        )}
        <p className="text-xs text-faint">
          Market odds have the sportsbook&apos;s margin removed. The Sinks model projects from each team&apos;s scoring
          for and against. For fun, not advice.
        </p>
      </section>

      <section aria-labelledby="lines">
        <h2 id="lines" className="display mb-3 text-xl font-bold">
          Lines
        </h2>
        <GameCard game={game} markets={markets} />
      </section>

      {leaders.length > 0 && (
        <section aria-labelledby="leaders">
          <h2 id="leaders" className="display mb-3 text-xl font-bold">
            Leaders
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[game.away, game.home].map((team) => (
              <div key={team.id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="mb-2 text-sm font-semibold">{team.shortName}</p>
                <ul className="space-y-1.5">
                  {leaders
                    .filter((l) => l.teamId === team.id)
                    .map((l) => (
                      <li key={l.category} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 text-sm">
                        <span className="text-muted">{l.category}</span>
                        <span className="min-w-0">
                          <span className="block truncate">{l.player}</span>
                          <span className="num block truncate text-xs text-faint">{l.value}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {compare.length > 0 && (
        <section aria-labelledby="team-stats" className="rounded-2xl border border-line bg-surface p-4">
          <h2 id="team-stats" className="display mb-3 text-xl font-bold">
            Team stats
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-faint">
                <th className="text-left font-medium">{game.away.abbr}</th>
                <th />
                <th className="text-right font-medium">{game.home.abbr}</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((k) => (
                <tr key={k} className="border-t border-line/60">
                  <td className="num py-1.5">{awayStats.get(k)}</td>
                  <td className="text-center text-xs text-muted">{k}</td>
                  <td className="num py-1.5 text-right">{homeStats.get(k)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {box.map((team) => (
        <TeamBox key={team.teamId} team={team} />
      ))}

      {game.state === "pre" && box.every((t) => t.groups.length === 0) && (
        <p className="text-sm text-muted">Box score appears once the game starts.</p>
      )}
    </div>
  );
}

function TeamBox({ team }: { team: BoxTeam }) {
  if (team.groups.length === 0) return null;
  return (
    <section aria-label={`${team.abbr} box score`} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 className="display border-b border-line px-4 py-3 text-lg font-bold">{team.abbr} box score</h2>
      {team.groups.map((g) => (
        <BoxTable key={g.name} group={g} titled={team.groups.length > 1} />
      ))}
    </section>
  );
}

function BoxTable({ group, titled }: { group: BoxGroup; titled: boolean }) {
  return (
    <div className="overflow-x-auto border-t border-line/60 first-of-type:border-t-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-xs text-faint">
            <th scope="col" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium">
              {titled ? group.name : "Player"}
            </th>
            {group.labels.map((l) => (
              <th key={l} scope="col" className="px-2 py-2 text-right font-medium">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.players.map((p, row) => (
            <tr key={`${p.id}-${row}`} className="border-t border-line/60">
              <th scope="row" className="sticky left-0 bg-surface px-4 py-1.5 text-left font-medium whitespace-nowrap">
                {p.name}
                {p.starter && <span className="ml-1.5 text-[10px] text-faint">S</span>}
              </th>
              {p.dnp || p.stats.length === 0 ? (
                <td colSpan={group.labels.length} className="px-2 text-right text-xs text-faint">
                  DNP
                </td>
              ) : (
                p.stats.map((s, i) => (
                  <td key={i} className="num px-2 py-1.5 text-right text-muted">
                    {s}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
