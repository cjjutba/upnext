import type { SessionState } from './types';

export interface Standing {
  playerId: string;
  /** 1-based. Players the cascade cannot separate share a rank, and the next rank skips. */
  rank: number;
  games: number;
  /** Finished games that recorded a winner. Only these feed wins, losses, and win rate. */
  decided: number;
  wins: number;
  losses: number;
  /** wins / decided, 0 when nothing this player played was decided. The column, not the sort. */
  winRate: number;
  /**
   * What the table actually sorts on: the win rate with one notional win and one
   * notional loss folded in, so a single lucky game cannot outrank an afternoon
   * of them. Six and zero beats one and zero, and both still read 100 percent.
   */
  weightedRate: number;
  /**
   * Mean win rate of everyone faced, counting each meeting, and counting an
   * opponent only on the games they played against somebody else. Beating the
   * same player five times should not make that player look weak. 0.5 stands in
   * for an opponent who has played nobody else, which is no evidence either way.
   */
  oppRate: number;
  /** Longest run of wins over decided games, in the order they finished. */
  bestRun: number;
  /** Points won minus points lost, over games whose score was readable. Null when none was. */
  pointDiff: number | null;
  /** How many of this player's games had a readable score. The margin key averages over it. */
  scoredGames: number;
  /** Consecutive wins on court right now. Only the winners templates grow it. */
  streak: number;
  /** The tiebreak that put this player below the one above. Null when the columns show why. */
  brokenBy: string | null;
  departed: boolean;
}

/** Two keys closer than this are the same number. Rates are divisions, not counts. */
const EPSILON = 1e-9;

interface Key {
  /** Higher ranks higher. Reads the tied group too, which is what head to head needs. */
  of: (row: Standing, group: readonly Standing[]) => number;
  /** Named on the row it separates. Null where the visible columns already explain the order. */
  label: string | null;
}

/** A group the cascade could not separate, and the key that put it below the last one. */
interface Bucket {
  rows: Standing[];
  because: string | null;
}

/** Pairwise tally, read as table[player][other]. */
type Pairwise = Record<string, Record<string, number>>;

function bump(table: Pairwise, a: string, b: string): void {
  table[a] ??= {};
  table[a][b] = (table[a][b] ?? 0) + 1;
}

/**
 * "11-7" and "11 7" both read as a four point win. The field is free text and the
 * organizer may type the loser first, so the margin is the gap, never the order.
 */
function pointMargin(score: string | undefined): number | null {
  const parts = score?.match(/\d+/g);
  if (!parts || parts.length !== 2) return null;
  return Math.abs(Number(parts[0]) - Number(parts[1]));
}

/**
 * Live table for every checked-in player, decided games and all. Derived from
 * finishedGames rather than a stored tally, so it stays correct through undo
 * and through a rule change mid-session.
 *
 * Ranking runs as a cascade: sort on the weighted win rate, then split whatever
 * is still level on head to head, point margin, opponents faced, and longest
 * run, in that order. Each key only ever reorders inside a tied group, so a
 * later key can never overturn an earlier one. A key that splits a group sends
 * every part back to the top of the cascade, the way a league table re-applies
 * its tiebreaks: head to head between the last two standing is a better answer
 * than anything indirect, and it only becomes readable once the group is down
 * to those two. Whoever survives all of it is genuinely level and shares a rank.
 */
export function standings(state: SessionState, nameOf: (id: string) => string): Standing[] {
  const wins: Record<string, number> = {};
  const decided: Record<string, number> = {};
  /** met[p][o] is games p played against o, won[p][o] is how many of them p won. */
  const met: Pairwise = {};
  const won: Pairwise = {};
  const margin: Record<string, number> = {};
  const scoredCount: Record<string, number> = {};
  const run: Record<string, number> = {};
  const best: Record<string, number> = {};

  for (const g of state.finishedGames) {
    if (g.winnerPair === undefined) continue;
    const winners = g.pairs[g.winnerPair];
    const losers = g.pairs[g.winnerPair === 0 ? 1 : 0];
    for (const p of winners) {
      wins[p] = (wins[p] ?? 0) + 1;
      decided[p] = (decided[p] ?? 0) + 1;
      run[p] = (run[p] ?? 0) + 1;
      best[p] = Math.max(best[p] ?? 0, run[p]);
    }
    for (const p of losers) {
      decided[p] = (decided[p] ?? 0) + 1;
      run[p] = 0;
    }
    for (const w of winners) {
      for (const l of losers) {
        bump(met, w, l);
        bump(met, l, w);
        bump(won, w, l);
      }
    }
    const m = pointMargin(g.score);
    if (m === null) continue;
    for (const p of winners) {
      margin[p] = (margin[p] ?? 0) + m;
      scoredCount[p] = (scoredCount[p] ?? 0) + 1;
    }
    for (const p of losers) {
      margin[p] = (margin[p] ?? 0) - m;
      scoredCount[p] = (scoredCount[p] ?? 0) + 1;
    }
  }

  /** o's win rate over everyone except p. Half when o has played nobody else. */
  const rateApartFrom = (o: string, p: string) => {
    const games = (decided[o] ?? 0) - (met[o]?.[p] ?? 0);
    return games === 0 ? 0.5 : ((wins[o] ?? 0) - (won[o]?.[p] ?? 0)) / games;
  };

  const rows: Standing[] = state.checkedIn.map((playerId) => {
    const w = wins[playerId] ?? 0;
    const d = decided[playerId] ?? 0;
    const faced = Object.entries(met[playerId] ?? {});
    const meetings = faced.reduce((n, [, count]) => n + count, 0);
    return {
      playerId,
      rank: 0,
      games: state.gamesPlayed[playerId] ?? 0,
      decided: d,
      wins: w,
      losses: d - w,
      winRate: d === 0 ? 0 : w / d,
      weightedRate: (w + 1) / (d + 2),
      oppRate: meetings === 0
        ? 0
        : faced.reduce((sum, [o, count]) => sum + count * rateApartFrom(o, playerId), 0) / meetings,
      bestRun: best[playerId] ?? 0,
      pointDiff: scoredCount[playerId] ? margin[playerId] ?? 0 : null,
      scoredGames: scoredCount[playerId] ?? 0,
      streak: state.consecutiveWins[playerId] ?? 0,
      brokenBy: null,
      departed: state.departed.includes(playerId),
    };
  });

  const keys: Key[] = [
    // nobody with a decided game ranks below somebody who has none, however badly it went
    { of: (row) => (row.decided > 0 ? 1 : 0), label: null },
    { of: (row) => row.weightedRate, label: null },
    {
      of: (row, group) => group.reduce((sum, other) => sum
        + (won[row.playerId]?.[other.playerId] ?? 0)
        - (won[other.playerId]?.[row.playerId] ?? 0), 0),
      label: 'head to head',
    },
    // scores are optional, so this key stays out of it unless everyone still tied
    // has one. It averages, because who typed more scores is not a result
    {
      of: (row, group) =>
        group.every((r) => r.scoredGames > 0) ? (row.pointDiff ?? 0) / row.scoredGames : 0,
      label: 'point margin',
    },
    { of: (row) => row.oppRate, label: 'opponents faced' },
    { of: (row) => row.bestRun, label: 'longest run' },
  ];

  const resolve = (group: Standing[], from: number, because: string | null): Bucket[] => {
    if (group.length === 1 || from === keys.length) return [{ rows: group, because }];
    const key = keys[from];
    const graded = group.map((row) => ({ row, k: key.of(row, group) })).sort((a, b) => b.k - a.k);
    const parts: { rows: Standing[]; k: number }[] = [];
    for (const { row, k } of graded) {
      const open = parts[parts.length - 1];
      // compare against the part, not the last row, so epsilon cannot drift down a long run
      if (open && Math.abs(open.k - k) < EPSILON) open.rows.push(row);
      else parts.push({ rows: [row], k });
    }
    if (parts.length === 1) return resolve(group, from + 1, because);
    return parts.flatMap((part, i) => resolve(part.rows, 0, i === 0 ? because : key.label));
  };

  const buckets = resolve(rows, 0, null);

  const out: Standing[] = [];
  for (const bucket of buckets) {
    bucket.rows.sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)));
    const rank = out.length + 1;
    bucket.rows.forEach((row, i) => {
      row.rank = rank;
      row.brokenBy = i === 0 ? bucket.because : null;
    });
    out.push(...bucket.rows);
  }
  return out;
}

/** Table cell text. A plain hyphen means nothing this player played was decided. */
export const winRateLabel = (row: Standing): string =>
  row.decided === 0 ? '-' : `${Math.round(row.winRate * 100)}%`;
