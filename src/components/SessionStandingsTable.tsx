import { StatusBadge } from './StatusBadge';
import { winRateLabel } from '../domain/standings';
import type { Standing } from '../domain/standings';

export function SessionStandingsTable({ rows, nameOf, live }: {
  rows: Standing[];
  nameOf: (playerId: string) => string;
  live?: boolean;
}) {
  const played = rows.some((row) => row.games > 0);
  return (
    <>
      <table className="session-standings" aria-label={live ? 'Live player ranks' : 'Final player ranks'}>
        <thead><tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col">Games</th>
          <th scope="col" aria-label="Wins">W</th>
          <th scope="col" aria-label="Losses">L</th>
          <th scope="col">Win rate</th>
          <th scope="col">Point margin</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={7}>Nobody has checked in yet.</td></tr> : rows.map((row) => (
            <tr key={row.playerId}>
              <td className="mono">{row.rank}</td>
              <th scope="row">
                <span className="standings-player">{nameOf(row.playerId)}</span>
                {live && row.departed ? <StatusBadge label="Left" /> : null}
                {live && !row.departed && row.streak >= 2 ? <StatusBadge status="live" label={`${row.streak} in a row`} /> : null}
                {row.brokenBy ? <span className="micro-label standings-tiebreak">{row.brokenBy}</span> : null}
              </th>
              <td className="mono">{row.games}</td>
              <td className="mono">{row.wins}</td>
              <td className="mono">{row.losses}</td>
              <td className="mono">{winRateLabel(row)}</td>
              <td>
                {row.pointDiff === null ? <span className="micro-label">No score</span> : (
                  <span className="mono">{row.pointDiff > 0 ? '+' : ''}{row.pointDiff}</span>
                )}
                {row.scoredGames < row.games ? (
                  <span className="micro-label standings-score-coverage">{row.scoredGames} of {row.games} scored</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {played ? <p className="standings-score-note">
        Point margin totals points won minus points lost in scored games. It breaks ties after head to head only when the tied players have played the same number of games and every game has a score.
      </p> : null}
    </>
  );
}
