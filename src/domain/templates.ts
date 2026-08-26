import type { Pairs, SessionState } from './types';

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

/** Partnership and opponent counts from finished plus active games. */
function pairHistory(state: SessionState): PairHistory {
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const record = (pairs: Pairs) => {
    for (const [p, q] of pairs) partners.set(pairKey(p, q), (partners.get(pairKey(p, q)) ?? 0) + 1);
    for (const p of pairs[0]) for (const q of pairs[1]) opponents.set(pairKey(p, q), (opponents.get(pairKey(p, q)) ?? 0) + 1);
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
  if (allEqual) return opts[state.pairingCycle % 3];
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
 * possible pairings rotate via pairingCycle so the same pairs never repeat.
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
    return variants[state.pairingCycle % 3];
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
