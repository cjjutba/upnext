import type { Pairs, SessionState } from './types';

export interface LastFinished {
  pairs: Pairs;
  winnerPair?: 0 | 1;
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
export function nextLineup(state: SessionState, lastFinished: LastFinished | null): Pairs | null {
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
  return freshFill(state);
}
