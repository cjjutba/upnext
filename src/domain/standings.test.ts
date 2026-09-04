import { describe, it, expect } from 'vitest';
import { standings } from './standings';
import { emptyState } from './types';
import type { FinishedGame, Pairs, SessionState } from './types';

const nameOf = (id: string) => id;

const finished = (pairs: Pairs, winnerPair?: 0 | 1, score?: string): FinishedGame => ({
  court: 1, pairs, winnerPair, score, startedAt: 0, endedAt: 1,
});

const build = (over: Partial<SessionState>): SessionState => ({ ...emptyState(), ...over });

const order = (state: SessionState) => standings(state, nameOf).map((r) => r.playerId);

describe('standings', () => {
  it('ranks by weighted win rate, and leaves a genuine mirror image tied', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 2, b: 2, c: 2, d: 2 },
      finishedGames: [
        finished([['a', 'b'], ['c', 'd']], 0),
        finished([['a', 'c'], ['b', 'd']], 0),
      ],
    });
    const rows = standings(state, nameOf);
    // b and c are 1 and 1, split their meetings, and faced the same field. Nothing separates them
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(rows.map((r) => r.brokenBy)).toEqual([null, null, null, null]);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 0, decided: 2, winRate: 1 });
    expect(rows[1]).toMatchObject({ wins: 1, losses: 1, winRate: 0.5 });
    expect(rows[3]).toMatchObject({ rank: 4, wins: 0, losses: 2, winRate: 0 });
  });

  it('puts six and zero above one and zero, though both read 100 percent', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 3, b: 1 },
      finishedGames: [
        finished([['a', 'x'], ['p', 'q']], 0),
        finished([['a', 'x'], ['p', 'q']], 0),
        finished([['a', 'x'], ['p', 'q']], 0),
        finished([['b', 'y'], ['r', 's']], 0),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(rows.every((r) => r.winRate === 1)).toBe(true);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(rows[1].brokenBy).toBe(null); // the games column already shows why
  });

  it('breaks a level pair on head to head first', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 2, b: 2 },
      finishedGames: [
        finished([['a', 'x'], ['b', 'y']], 0), // a beat b
        finished([['a', 'x'], ['c', 'd']], 1),
        finished([['b', 'y'], ['e', 'f']], 0),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(rows.every((r) => r.winRate === 0.5)).toBe(true);
    expect(rows[1].brokenBy).toBe('head to head');
  });

  it('breaks on point margin when everyone still level recorded a score', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 1, b: 1 },
      finishedGames: [
        finished([['a', 'x'], ['c', 'd']], 0, '11-3'),
        finished([['b', 'y'], ['e', 'f']], 0, '11-9'),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(rows.map((r) => r.pointDiff)).toEqual([8, 2]);
    expect(rows[1].brokenBy).toBe('point margin');
  });

  it('leaves point margin out of it when only some of the level players have a score', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 1, b: 1 },
      finishedGames: [
        finished([['a', 'x'], ['c', 'd']], 0, '11-3'),
        finished([['b', 'y'], ['e', 'f']], 0),
        finished([['c', 'x'], ['g', 'h']], 0), // c is now 1 and 1, so a faced a better field
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => r.pointDiff)).toEqual([8, null]);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(rows[1].brokenBy).toBe('opponents faced');
  });

  it('falls through to the longest run when nothing else separates two players', () => {
    const win = (p: string, partner: string, o1: string, o2: string, w: 0 | 1) =>
      finished([[p, partner], [o1, o2]], w);
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 4, b: 4 },
      finishedGames: [
        win('a', 'x', 'c', 'd', 0), win('a', 'x', 'c', 'd', 0), // two in a row
        win('a', 'x', 'c', 'd', 1), win('a', 'x', 'c', 'd', 1),
        win('b', 'y', 'e', 'f', 0), win('b', 'y', 'e', 'f', 1), // never twice
        win('b', 'y', 'e', 'f', 0), win('b', 'y', 'e', 'f', 1),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => [r.playerId, r.bestRun])).toEqual([['a', 2], ['b', 1]]);
    expect(rows[1].brokenBy).toBe('longest run');
  });

  it('re-applies the cascade to the group a key just split, so a direct meeting still counts', () => {
    const beats = (w: string, l: string) => finished([[w, 'x'], [l, 'p']], 0);
    const filler = (p: string, w: 0 | 1) => finished([[p, 'x'], ['p', 'q']], w);
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 4, b: 4, c: 4, d: 4 },
      finishedGames: [
        beats('a', 'c'), beats('a', 'd'), beats('c', 'b'), beats('b', 'd'),
        // everyone ends 2 and 2, so only head to head can separate them
        filler('a', 1), filler('a', 1),
        filler('b', 0), filler('b', 1),
        filler('c', 0), filler('c', 1),
        filler('d', 0), filler('d', 0),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.every((r) => r.wins === 2 && r.losses === 2)).toBe(true);
    // a is clear of the group on head to head. b and c are level across the group and
    // c beat b, which is only readable once the two of them are alone
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'c', 'b', 'd']);
    expect(rows.map((r) => r.brokenBy)).toEqual([null, 'head to head', 'head to head', 'head to head']);
  });

  it('rates an opponent on the games they played against somebody else', () => {
    const state = build({
      checkedIn: ['a'],
      finishedGames: [
        finished([['a', 'x'], ['c', 'y']], 0),
        finished([['a', 'x'], ['c', 'y']], 0),
        finished([['a', 'x'], ['c', 'y']], 0),
        finished([['c', 'p'], ['q', 'r']], 0),
        finished([['c', 'p'], ['q', 'r']], 0),
        finished([['c', 'p'], ['q', 'r']], 0),
      ],
    });
    // c reads 3 and 3 overall but wins everything away from a, so a faced a winner, not a
    // 50 percent player. y has played nobody but a, which is no evidence either way
    expect(standings(state, nameOf)[0].oppRate).toBe((3 * 1 + 3 * 0.5) / 6);
  });

  it('averages the point margin, so typing more scores is not itself a result', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 2, b: 2 },
      finishedGames: [
        finished([['a', 'x'], ['p', 'q']], 0, '11-3'),
        finished([['a', 'x'], ['p', 'q']], 0),
        finished([['b', 'y'], ['r', 's']], 0, '11-5'),
        finished([['b', 'y'], ['r', 's']], 0, '11-7'),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => [r.pointDiff, r.scoredGames])).toEqual([[8, 1], [10, 2]]);
    // b has the bigger total and the smaller margin per game
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b']);
    expect(rows[1].brokenBy).toBe('point margin');
  });

  it('players the cascade cannot separate share a rank and the next rank skips', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']], 0)],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 3]]);
    expect(rows.map((r) => r.brokenBy)).toEqual([null, null, null, null]);
  });

  it('a player with no decided games scores zero, never NaN', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']])], // finished with no winner
    });
    const rows = standings(state, nameOf);
    expect(rows.every((r) => r.winRate === 0 && r.decided === 0 && r.losses === 0)).toBe(true);
    expect(rows.every((r) => r.games === 1 && r.rank === 1)).toBe(true);
  });

  it('checked-in players who never played still appear, at the bottom', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd', 'e'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']], 0)],
    });
    const rows = standings(state, nameOf);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ playerId: 'e', games: 0, wins: 0, winRate: 0, rank: 5 });
  });

  it('keeps departed players in the table and flags them', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      departed: ['a'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']], 0)],
    });
    const rows = standings(state, nameOf);
    expect(rows.find((r) => r.playerId === 'a')).toMatchObject({ departed: true, wins: 1, rank: 1 });
    expect(rows.filter((r) => r.departed)).toHaveLength(1);
  });

  it('carries the live win streak through from state', () => {
    const state = build({
      checkedIn: ['a', 'b'],
      gamesPlayed: { a: 3, b: 3 },
      consecutiveWins: { a: 2, b: 0 },
      finishedGames: [finished([['a', 'x'], ['b', 'y']], 0)],
    });
    expect(standings(state, nameOf).find((r) => r.playerId === 'a')!.streak).toBe(2);
  });

  it('reads a score whichever way round it was typed, and ignores one it cannot parse', () => {
    const margin = (score: string | undefined) => standings(build({
      checkedIn: ['a'],
      finishedGames: [finished([['a', 'x'], ['c', 'd']], 0, score)],
    }), nameOf)[0].pointDiff;
    expect(margin('11-7')).toBe(4);
    expect(margin('7-11')).toBe(4);
    expect(margin('11 7')).toBe(4);
    expect(margin('close one')).toBe(null);
    expect(margin(undefined)).toBe(null);
  });

  it('is stable: the same log always produces the same order', () => {
    const state = build({
      checkedIn: ['d', 'c', 'b', 'a'],
      gamesPlayed: { a: 2, b: 2, c: 2, d: 2 },
      finishedGames: [
        finished([['a', 'b'], ['c', 'd']], 0),
        finished([['a', 'c'], ['b', 'd']], 0),
      ],
    });
    expect(order(state)).toEqual(order(state));
    expect(order(state)).toEqual(['a', 'b', 'c', 'd']); // name order inside a tie, whatever the check-in order was
  });
});
