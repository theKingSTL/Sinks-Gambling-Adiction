import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { GameCard, StatusPill } from "@/components/game-card";
import { TeamLogo } from "@/components/team-logo";
import { getGameDetail, getMarketsForGame } from "@/lib/nba/espn";
import type { BoxTeam } from "@/lib/nba/parse";

export async function generateMetadata({ params }: PageProps<"/games/[id]">): Promise<Metadata> {
  const detail = await getGameDetail((await params).id);
  return { title: detail ? `${detail.game.away.abbr} @ ${detail.game.home.abbr}` : "Game" };
}

const KEY_STATS = ["FG%", "3P%", "FT%", "REB", "AST", "TO", "STL", "BLK"];

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  const detail = await getGameDetail(id);
  if (!detail) notFound();
  const { game, box, teamStats, leaders } = detail;
  const markets = await getMarketsForGame(game);

  const statsFor = (teamId: string) => new Map(teamStats.find((t) => t.teamId === teamId)?.stats.map((s) => [s.label, s.value]));
  const awayStats = statsFor(game.away.id);
  const homeStats = statsFor(game.home.id);
  const compare = KEY_STATS.filter((k) => awayStats.has(k) && homeStats.has(k));

  return (
    <div className="space-y-6">
      {game.state === "in" && <AutoRefresh seconds={20} />}
      <Link href="/" className="text-sm text-muted hover:text-text">
        ← All games
      </Link>

      <section className="rounded-3xl border border-line bg-surface p-6">
        <div className="mb-4 text-center">
          <StatusPill game={game} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {[game.away, null, game.home].map((team, i) =>
            team ? (
              <div key={team.id} className={`flex flex-col items-center gap-2 ${i === 0 ? "" : ""}`}>
                <TeamLogo src={team.logo} abbr={team.abbr} size={64} />
                <p className="text-center font-semibold">{team.name}</p>
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
                      <li key={l.category} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                        <span className="text-muted">{l.category}</span>
                        <span className="truncate">{l.player}</span>
                        <span className="num font-semibold">{l.value}</span>
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
        <BoxScore key={team.teamId} team={team} />
      ))}

      {game.state === "pre" && box.length === 0 && (
        <p className="text-sm text-muted">Box score appears at tip-off.</p>
      )}
    </div>
  );
}

function BoxScore({ team }: { team: BoxTeam }) {
  if (team.players.length === 0) return null;
  return (
    <section aria-label={`${team.abbr} box score`} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 className="display border-b border-line px-4 py-3 text-lg font-bold">{team.abbr} box score</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs text-faint">
              <th scope="col" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium">
                Player
              </th>
              {team.labels.map((l) => (
                <th key={l} scope="col" className="px-2 py-2 text-right font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.players.map((p) => (
              <tr key={p.id} className="border-t border-line/60">
                <th scope="row" className="sticky left-0 bg-surface px-4 py-1.5 text-left font-medium whitespace-nowrap">
                  {p.name}
                  {p.starter && <span className="ml-1.5 text-[10px] text-faint">S</span>}
                </th>
                {p.dnp ? (
                  <td colSpan={team.labels.length} className="px-2 text-right text-xs text-faint">
                    DNP
                  </td>
                ) : (
                  p.stats.map((s, i) => (
                    <td key={i} className={`num px-2 py-1.5 text-right ${team.labels[i] === "PTS" ? "font-semibold" : "text-muted"}`}>
                      {s}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
