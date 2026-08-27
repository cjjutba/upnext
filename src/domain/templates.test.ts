import { describe, it, expect } from 'vitest';
import { freshFill, nextChallengers, nextLineup, previewLineups, upNextPreview } from './templates';
import { emptyState } from './types';
import type { SessionState, Pairs, FinishedGame } from './types';

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

  it('rotates the three pairings by games played together when exactly four remain', () => {
    const four = { queue: ['a', 'b', 'c', 'd'] };
    const games = (n: number): FinishedGame[] =>
      Array.from({ length: n }, (_, i) => ({ court: 1, pairs: [['a', 'c'], ['b', 'd']] as Pairs, startedAt: i, endedAt: i + 1 }));
    expect(freshFill(state({ ...four }))).toEqual([['a', 'c'], ['b', 'd']]);
    expect(freshFill(state({ ...four, finishedGames: games(1) }))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(freshFill(state({ ...four, finishedGames: games(2) }))).toEqual([['a', 'd'], ['b', 'c']]);
    expect(freshFill(state({ ...four, finishedGames: games(3) }))).toEqual([['a', 'c'], ['b', 'd']]);
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

describe('balanced and social pairing', () => {
  it('balanced picks the partition that minimizes rating imbalance', () => {
    const s = state({ rule: { template: 'balanced', winCap: 3 }, queue: ['a', 'b', 'c', 'd'] });
    const ratings = { a: 5, b: 5, c: 1, d: 1 };
    // partitions: ac|bd imbalance 0, ab|cd imbalance 8, ad|bc imbalance 0; first minimal wins
    expect(nextLineup(s, null, ratings)).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('balanced breaks rating ties by avoiding repeat partners', () => {
    const s = state({
      rule: { template: 'balanced', winCap: 3 },
      queue: ['a', 'b', 'c', 'd'],
      finishedGames: [{ court: 1, pairs: [['a', 'c'], ['b', 'd']], startedAt: 0, endedAt: 1 }],
    });
    // all unrated (3 each): every partition ties at 0 imbalance; ac and bd already partnered
    expect(nextLineup(s, null, {})).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('social avoids repeat partners and ignores ratings', () => {
    const s = state({
      rule: { template: 'social', winCap: 3 },
      queue: ['a', 'b', 'c', 'd'],
      finishedGames: [
        { court: 1, pairs: [['a', 'c'], ['b', 'd']], startedAt: 0, endedAt: 1 },
        { court: 1, pairs: [['a', 'b'], ['c', 'd']], startedAt: 1, endedAt: 2 },
      ],
    });
    const ratings = { a: 5, b: 1, c: 5, d: 1 }; // would push balanced elsewhere; social must not care
    expect(nextLineup(s, null, ratings)).toEqual([['a', 'd'], ['b', 'c']]);
  });

  it('social counts active games as history too', () => {
    const s = state({
      rule: { template: 'social', winCap: 3 },
      queue: ['a', 'b', 'c', 'd'],
      games: { 2: { court: 2, pairs: [['x', 'y'], ['z', 'w']], startedAt: 0, startedEventId: 'e' } },
    });
    expect(nextLineup(s, null, {})).toEqual([['a', 'c'], ['b', 'd']]); // no relevant history: partition order wins
  });

  it('the four players are always the front four eligible, never cherry picked', () => {
    const s = state({ rule: { template: 'balanced', winCap: 3 }, queue: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const ratings = { a: 1, b: 1, c: 1, d: 1, e: 5, f: 5 };
    const pairs = nextLineup(s, null, ratings)!;
    const players = [...pairs[0], ...pairs[1]].sort();
    expect(players).toEqual(['a', 'b', 'c', 'd']); // e and f wait their turn no matter their ratings
  });
});

describe('nextChallengers', () => {
  it('names the two waiting players who go on next whoever wins', () => {
    const s = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['a', 'b', 'c'] });
    expect(nextChallengers(s)).toEqual(['a', 'b']);
  });

  it('skips sitting-out players', () => {
    const s = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['x', 'a', 'b'], sittingOut: ['x'] });
    expect(nextChallengers(s)).toEqual(['a', 'b']);
  });

  it('returns null when fewer than two are eligible', () => {
    expect(nextChallengers(state({ queue: ['a'] }))).toBeNull();
    expect(nextChallengers(state({ queue: ['a', 'b'], sittingOut: ['b'] }))).toBeNull();
  });

  it('holds whether the winners stay or get capped to the back', () => {
    // uncapped the reducer fronts the winners, capped it fronts the queue; either way the front two waiting are inside the next four
    const s = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['w1', 'w2', 'q0', 'q1'] });
    const stayed = nextLineup(s, { pairs: [['w1', 'w2'], ['l1', 'l2']], winnerPair: 0 })!;
    expect([...stayed[0], ...stayed[1]]).toEqual(expect.arrayContaining(['q0', 'q1']));
    const capped = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['q0', 'q1', 'q2', 'q3', 'w1', 'w2'] });
    const fresh = nextLineup(capped, { pairs: [['w1', 'w2'], ['l1', 'l2']], winnerPair: 0 })!;
    expect([...fresh[0], ...fresh[1]]).toEqual(expect.arrayContaining(['q0', 'q1']));
  });
});

describe('upNextPreview across every mode', () => {
  // one queue, one history, one set of ratings: only the template changes
  const base = {
    queue: ['a', 'b', 'c', 'd', 'e', 'f'],
    finishedGames: [{ court: 1, pairs: [['a', 'c'], ['x', 'y']] as Pairs, startedAt: 0, endedAt: 1 }],
  };
  const ratings = { a: 5, b: 5, c: 1, d: 1 };
  const preview = (template: SessionState['rule']['template']) =>
    upNextPreview(state({ ...base, rule: { template, winCap: 3 } }), ratings);

  it('classic queue takes the front four in paddle order, ignoring ratings and history', () => {
    expect(preview('all-off')).toEqual({ kind: 'lineup', pairs: [['a', 'c'], ['b', 'd']] });
  });

  it('balanced levels the two teams by rating, then breaks the tie on repeat partners', () => {
    // ac|bd and ad|bc both level at 0; a and c already partnered, so ad|bc wins
    expect(preview('balanced')).toEqual({ kind: 'lineup', pairs: [['a', 'd'], ['b', 'c']] });
  });

  it('social mix splits the repeat partners and ignores the ratings that moved balanced', () => {
    expect(preview('social')).toEqual({ kind: 'lineup', pairs: [['a', 'b'], ['c', 'd']] });
  });

  it('winners shows the guaranteed challengers, because the four depend on who wins', () => {
    expect(preview('winners-stay')).toEqual({ kind: 'challengers', pair: ['a', 'b'] });
    expect(preview('winners-split')).toEqual({ kind: 'challengers', pair: ['a', 'b'] });
  });

  it('previews nothing when no game can be formed', () => {
    expect(upNextPreview(state({ rule: { template: 'balanced', winCap: 3 }, queue: ['a', 'b', 'c'] }))).toBeNull();
    expect(upNextPreview(state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['a'] }))).toBeNull();
  });

  it('always keeps the front four eligible, whatever the mode does with the pairing', () => {
    for (const template of ['all-off', 'balanced', 'social'] as const) {
      const p = preview(template);
      expect(p?.kind).toBe('lineup');
      const four = p!.kind === 'lineup' ? [...p!.pairs[0], ...p!.pairs[1]].sort() : [];
      expect(four).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('previewLineups', () => {
  const lineup = (pairs: Pairs) => ({ kind: 'lineup', pairs });

  it('chunks the waiting players into fours and leads with upNextPreview', () => {
    const s = state({ queue: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] });
    const chunks = previewLineups(s, {});
    expect(chunks).toHaveLength(2); // nine waiting is two fours plus a leftover
    expect(chunks[0]).toEqual(upNextPreview(s, {}));
    expect(chunks[1]).toEqual(lineup([['e', 'g'], ['f', 'h']]));
  });

  it('skips sitting-out players and stops at max', () => {
    const s = state({ queue: ['a', 'x', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], sittingOut: ['x'] });
    expect(previewLineups(s, {})).toEqual([lineup([['a', 'c'], ['b', 'd']]), lineup([['e', 'g'], ['f', 'h']])]);
    expect(previewLineups(s, {}, 1)).toHaveLength(1);
  });

  it('returns nothing with fewer than four waiting', () => {
    expect(previewLineups(state({ queue: ['a', 'b', 'c'] }), {})).toEqual([]);
  });

  it('honours the balanced pairing on the first four', () => {
    const s = state({ rule: { template: 'balanced', winCap: 3 }, queue: ['a', 'b', 'c', 'd', 'e'] });
    expect(previewLineups(s, { a: 5, b: 5, c: 1, d: 1 })[0]).toEqual(lineup([['a', 'c'], ['b', 'd']]));
  });

  it('stops at the challengers in a winners template, which cannot name a four', () => {
    const s = state({ rule: { template: 'winners-stay', winCap: 3 }, queue: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    expect(previewLineups(s, {})).toEqual([{ kind: 'challengers', pair: ['a', 'b'] }]);
  });
});
