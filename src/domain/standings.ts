import type { SessionState } from './types';

export interface Standing {
  playerId: string;
  /** 1-based. Players equal on every numeric key share a rank, and the next rank skips. */
  rank: number;
  games: number;
  /** Finished games that recorded a winner. Only these feed wins, losses, and win rate. */
  decided: number;
  wins: number;
  losses: number;
  /** wins / decided, 0 when nothing this player played was decided. */
  winRate: number;
  /** Consecutive wins on court right now. Only the winners templates grow it. */
  streak: number;
  departed: boolean;
}

/**
 * Live table for every checked-in player, decided games and all. Derived from
 * finishedGames rather than a stored tally, so it stays correct through undo
 * and through a rule change mid-session.
 */
export function standings(state: SessionState, nameOf: (id: string) => string): Standing[] {
  const wins: Record<string, number> = {};
  const decided: Record<string, number> = {};
  for (const g of state.finishedGames) {
    if (g.winnerPair === undefined) continue;
    const winners = g.pairs[g.winnerPair];
    const losers = g.pairs[g.winnerPair === 0 ? 1 : 0];
    for (const p of winners) {
      wins[p] = (wins[p] ?? 0) + 1;
      decided[p] = (decided[p] ?? 0) + 1;
    }
    for (const p of losers) decided[p] = (decided[p] ?? 0) + 1;
  }

  const rows = state.checkedIn.map((playerId) => {
    const w = wins[playerId] ?? 0;
    const d = decided[playerId] ?? 0;
    return {
      playerId,
      rank: 0,
      games: state.gamesPlayed[playerId] ?? 0,
      decided: d,
      wins: w,
      losses: d - w,
      winRate: d === 0 ? 0 : w / d,
      streak: state.consecutiveWins[playerId] ?? 0,
      departed: state.departed.includes(playerId),
    };
  });

  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.winRate - a.winRate ||
      b.games - a.games ||
      nameOf(a.playerId).localeCompare(nameOf(b.playerId)),
  );

  const tied = (a: Standing, b: Standing) => a.wins === b.wins && a.winRate === b.winRate && a.games === b.games;
  rows.forEach((row, i) => {
    row.rank = i > 0 && tied(rows[i - 1], row) ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

/** Table cell text. A plain hyphen means nothing this player played was decided. */
export const winRateLabel = (row: Standing): string =>
  row.decided === 0 ? '-' : `${Math.round(row.winRate * 100)}%`;
