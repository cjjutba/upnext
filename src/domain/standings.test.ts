import { describe, it, expect } from 'vitest';
import { standings } from './standings';
import { emptyState } from './types';
import type { FinishedGame, Pairs, SessionState } from './types';

const nameOf = (id: string) => id;

const finished = (pairs: Pairs, winnerPair?: 0 | 1): FinishedGame => ({
  court: 1, pairs, winnerPair, startedAt: 0, endedAt: 1,
});

const build = (over: Partial<SessionState>): SessionState => ({ ...emptyState(), ...over });

describe('standings', () => {
  it('ranks by wins, then win rate, then games played, then name', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 2, b: 2, c: 2, d: 2 },
      finishedGames: [
        finished([['a', 'b'], ['c', 'd']], 0),
        finished([['a', 'c'], ['b', 'd']], 0),
      ],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[0]).toMatchObject({ rank: 1, wins: 2, losses: 0, decided: 2, winRate: 1 });
    expect(rows[1]).toMatchObject({ rank: 2, wins: 1, losses: 1, winRate: 0.5 });
    expect(rows[3]).toMatchObject({ rank: 4, wins: 0, losses: 2, winRate: 0 });
  });

  it('players equal on wins, win rate, and games share a rank and the next rank skips', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']], 0)],
    });
    const rows = standings(state, nameOf);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([['a', 1], ['b', 1], ['c', 3], ['d', 3]]);
  });

  it('a player with no decided games scores zero, never NaN', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']])], // finished with no winner
    });
    const rows = standings(state, nameOf);
    expect(rows.every((r) => r.winRate === 0 && r.decided === 0 && r.losses === 0)).toBe(true);
    expect(rows.every((r) => r.games === 1)).toBe(true);
  });

  it('checked-in players who never played still appear, at the bottom', () => {
    const state = build({
      checkedIn: ['a', 'b', 'c', 'd', 'e'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [finished([['a', 'b'], ['c', 'd']], 0)],
    });
    const rows = standings(state, nameOf);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ playerId: 'e', games: 0, wins: 0, winRate: 0 });
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
});
