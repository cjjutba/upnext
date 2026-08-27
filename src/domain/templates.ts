import type { Lineup, Pair, Pairs, SessionState } from './types';
import { isWinnersTemplate } from './types';

export interface LastFinished {
  pairs: Pairs;
  winnerPair?: 0 | 1;
}

export type Ratings = Record<string, number | undefined>;

const pairKey = (x: string, y: string): string => (x < y ? x + '|' + y : y + '|' + x);

interface PairHistory {
  partners: Map<string, number>;
  opponents: Map<string, number>;
}

/** Finished games whose four players are exactly this four. Stable between a preview and the fill it promises. */
function gamesTogether(state: SessionState, four: [string, string, string, string]): number {
  return state.finishedGames.filter((g) => {
    const players = [...g.pairs[0], ...g.pairs[1]];
    return four.every((p) => players.includes(p));
  }).length;
}

/** Partnership and opponent counts from finished plus active games. */
function pairHistory(state: SessionState): PairHistory {
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  // a live court may hold an open seat, and an open seat has partnered with nobody
  const record = (pairs: Lineup) => {
    for (const [p, q] of pairs) if (p && q) partners.set(pairKey(p, q), (partners.get(pairKey(p, q)) ?? 0) + 1);
    for (const p of pairs[0]) for (const q of pairs[1]) {
      if (p && q) opponents.set(pairKey(p, q), (opponents.get(pairKey(p, q)) ?? 0) + 1);
    }
  };
  for (const g of state.finishedGames) record(g.pairs);
  for (const g of Object.values(state.games)) record(g.pairs);
  return { partners, opponents };
}

const partitions = (a: string, b: string, c: string, d: string): Pairs[] => [
  [[a, c], [b, d]],
  [[a, b], [c, d]],
  [[a, d], [b, c]],
];

/**
 * Balanced and social pairing. The four players are fixed (front four
 * eligible, fairness is never traded); only the partition is chosen.
 */
function pickPairing(state: SessionState, four: [string, string, string, string], ratings: Ratings): Pairs {
  const social = state.rule.template === 'social';
  const h = pairHistory(state);
  const rate = (p: string) => ratings[p] ?? 3;
  const score = (pairs: Pairs): [number, number, number] => {
    const partnerRepeats =
      (h.partners.get(pairKey(pairs[0][0], pairs[0][1])) ?? 0) + (h.partners.get(pairKey(pairs[1][0], pairs[1][1])) ?? 0);
    let opponentRepeats = 0;
    for (const p of pairs[0]) for (const q of pairs[1]) opponentRepeats += h.opponents.get(pairKey(p, q)) ?? 0;
    const imbalance = Math.abs(rate(pairs[0][0]) + rate(pairs[0][1]) - rate(pairs[1][0]) - rate(pairs[1][1]));
    return social ? [partnerRepeats, opponentRepeats, 0] : [imbalance, partnerRepeats, opponentRepeats];
  };
  const opts = partitions(...four);
  const scores = opts.map(score);
  const allEqual = scores.every((s) => s[0] === scores[0][0] && s[1] === scores[0][1] && s[2] === scores[0][2]);
  if (allEqual) return opts[gamesTogether(state, four) % 3];
  let best = opts[0];
  let bestScore = scores[0];
  for (let i = 1; i < opts.length; i += 1) {
    const s = scores[i];
    if (
      s[0] < bestScore[0] ||
      (s[0] === bestScore[0] && (s[1] < bestScore[1] || (s[1] === bestScore[1] && s[2] < bestScore[2])))
    ) {
      best = opts[i];
      bestScore = s;
    }
  }
  return best;
}

const eligible = (state: SessionState): string[] =>
  state.queue.filter((p) => !state.sittingOut.includes(p));

/**
 * Fill a court from the queue. Positions 1 and 3 versus 2 and 4, which mixes
 * people who arrived together. With exactly four eligible players the three
 * possible pairings rotate by how many games this exact four has already
 * played together, so the same pairs never repeat and a preview computed
 * before a finish always matches the fill that finish produces.
 */
export function freshFill(state: SessionState): Pairs | null {
  const e = eligible(state);
  if (e.length < 4) return null;
  const [a, b, c, d] = e;
  if (e.length === 4) {
    const variants: Pairs[] = [
      [[a, c], [b, d]],
      [[a, b], [c, d]],
      [[a, d], [b, c]],
    ];
    return variants[gamesTogether(state, [a, b, c, d]) % 3];
  }
  return [[a, c], [b, d]];
}

/**
 * The template decision for the court that just finished. The reducer has
 * already reinserted players (stayers at the front), so queue order encodes
 * who kept the court. Other courts fill with lastFinished null.
 */
export function nextLineup(state: SessionState, lastFinished: LastFinished | null, ratings: Ratings = {}): Pairs | null {
  const e = eligible(state);
  if (e.length < 4) return null;
  const t = state.rule.template;
  if (lastFinished && lastFinished.winnerPair !== undefined && (t === 'winners-stay' || t === 'winners-split')) {
    const winners = lastFinished.pairs[lastFinished.winnerPair];
    const [a, b, c, d] = e;
    const aStays = winners.includes(a);
    const bStays = winners.includes(b);
    if (t === 'winners-stay' && aStays && bStays) return [[a, b], [c, d]];
    if (t === 'winners-split') {
      if (aStays && bStays) return [[a, c], [b, d]]; // first winner with queue position 1
      if (aStays) return [[a, b], [c, d]]; // single stayer anchors the first pair
    }
  }
  if (t === 'balanced' || t === 'social') {
    const [a, b, c, d] = e;
    return pickPairing(state, [a, b, c, d], ratings);
  }
  return freshFill(state);
}

/** What the board can honestly promise about the next game under the current rule. */
export type UpNextPreview =
  | { kind: 'lineup'; pairs: Pairs }
  | { kind: 'challengers'; pair: Pair };

/**
 * The two waiting players who go on next in a winners template, whoever wins.
 * Sound either way the finish falls: uncapped, the reducer fronts the winners
 * and the next four are the winners plus these two; capped, it fronts the
 * queue and these two lead it.
 */
export function nextChallengers(state: SessionState): Pair | null {
  const e = eligible(state);
  return e.length >= 2 ? [e[0], e[1]] : null;
}

/**
 * The single preview entry point for every mode. Winners templates cannot name
 * the four before a winner exists, only the challengers, so the shape differs
 * and callers branch on kind rather than on the template.
 */
export function upNextPreview(state: SessionState, ratings: Ratings = {}): UpNextPreview | null {
  if (isWinnersTemplate(state.rule.template)) {
    const pair = nextChallengers(state);
    return pair ? { kind: 'challengers', pair } : null;
  }
  const pairs = nextLineup(state, null, ratings);
  return pairs ? { kind: 'lineup', pairs } : null;
}
