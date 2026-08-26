import { describe, it, expect } from 'vitest';
import { freshFill, nextLineup } from './templates';
import { emptyState } from './types';
import type { SessionState, Pairs } from './types';

function state(over: Partial<SessionState>): SessionState {
  return { ...emptyState(), started: true, sessionId: 's', courtCount: 1, ...over };
}

describe('freshFill', () => {
  it('pairs queue positions 1 and 3 versus 2 and 4', () => {
    const s = state({ queue: ['a', 'b', 'c', 'd', 'e'] });
    expect(freshFill(s)).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('returns null with fewer than four eligible players, never a game of three', () => {
    expect(freshFill(state({ queue: ['a', 'b', 'c'] }))).toBeNull();
    expect(freshFill(state({ queue: ['a', 'b', 'c', 'd'], sittingOut: ['d'] }))).toBeNull();
  });

  it('skips sitting-out players without losing their spots', () => {
    const s = state({ queue: ['a', 'x', 'b', 'c', 'd'], sittingOut: ['x'] });
    expect(freshFill(s)).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('rotates the three pairings when exactly four players remain', () => {
    const four = { queue: ['a', 'b', 'c', 'd'] };
    expect(freshFill(state({ ...four, pairingCycle: 0 }))).toEqual([['a', 'c'], ['b', 'd']]);
    expect(freshFill(state({ ...four, pairingCycle: 1 }))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(freshFill(state({ ...four, pairingCycle: 2 }))).toEqual([['a', 'd'], ['b', 'c']]);
    expect(freshFill(state({ ...four, pairingCycle: 3 }))).toEqual([['a', 'c'], ['b', 'd']]);
  });
});

describe('nextLineup', () => {
  const finished = (winnerPair: 0 | 1, pairs: Pairs = [['w1', 'w2'], ['l1', 'l2']]) => ({ pairs, winnerPair });

  it('winners-stay keeps the winning pair together against the next two', () => {
    const s = state({
      rule: { template: 'winners-stay', winCap: 3 },
      queue: ['w1', 'w2', 'c1', 'c2', 'x'], // reducer fronted the winners
    });
    expect(nextLineup(s, finished(0))).toEqual([['w1', 'w2'], ['c1', 'c2']]);
  });

  it('winners-stay falls back to a fresh fill when the winners were capped to the back', () => {
    const s = state({
      rule: { template: 'winners-stay', winCap: 1 },
      queue: ['a', 'b', 'c', 'd', 'w1', 'w2'],
    });
    expect(nextLineup(s, finished(0))).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('winners-split pairs each winner with a challenger, first winner with queue position 1', () => {
    const s = state({
      rule: { template: 'winners-split', winCap: 3 },
      queue: ['w1', 'w2', 'c1', 'c2'],
    });
    expect(nextLineup(s, finished(0))).toEqual([['w1', 'c1'], ['w2', 'c2']]);
  });

  it('winners-split with a single stayer anchors the first pair', () => {
    const s = state({
      rule: { template: 'winners-split', winCap: 2 },
      queue: ['w1', 'c1', 'c2', 'c3', 'w2'], // w2 was capped to the back
    });
    expect(nextLineup(s, finished(0))).toEqual([['w1', 'c1'], ['c2', 'c3']]);
  });

  it('all-off ignores the finished game and fresh fills', () => {
    const s = state({ rule: { template: 'all-off', winCap: 3 }, queue: ['e', 'a', 'c', 'b', 'd'] });
    expect(nextLineup(s, finished(0))).toEqual([['e', 'c'], ['a', 'b']]);
  });

  it('returns null when fewer than four are eligible', () => {
    const s = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['w1', 'w2', 'c1'] });
    expect(nextLineup(s, finished(0))).toBeNull();
  });
});
