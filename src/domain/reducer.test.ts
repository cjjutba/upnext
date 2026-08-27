import { describe, it, expect } from 'vitest';
import { replay } from './reducer';
import type { EventPayload, SessionEvent, Pairs, RuleTemplate } from './types';

const SID = 'session-1';
let counter = 0;

/** Test event factory: ids are zero padded so string order equals creation order. */
function ev(payload: EventPayload, ts = 0): SessionEvent {
  counter += 1;
  return {
    ...payload,
    id: `evt-${String(counter).padStart(6, '0')}`,
    sessionId: SID,
    deviceId: 'dev-1',
    seq: counter,
    ts: ts || counter,
    v: 1,
  } as SessionEvent;
}

const start = (courts = 2, template: RuleTemplate = 'all-off', winCap = 2) =>
  ev({ type: 'session-started', courts, template, config: { winCap } });
const checkIn = (p: string) => ev({ type: 'player-checked-in', playerId: p });
const game = (court: number, pairs: Pairs) => ev({ type: 'game-started', court, pairs });
const finish = (court: number, winnerPair?: 0 | 1) => ev({ type: 'game-finished', court, winnerPair });

describe('session lifecycle', () => {
  it('applies session-started and session-ended', () => {
    const s = replay([start(3), ev({ type: 'session-ended' })]);
    expect(s.started).toBe(true);
    expect(s.ended).toBe(true);
    expect(s.courtCount).toBe(3);
    expect(s.rule).toEqual({ template: 'all-off', winCap: 2 });
  });

  it('rule-changed updates rule config in state', () => {
    const s = replay([start(), ev({ type: 'rule-changed', template: 'winners-stay', config: { winCap: 3 } })]);
    expect(s.rule).toEqual({ template: 'winners-stay', winCap: 3 });
  });
});

describe('check-in and queue', () => {
  it('checked-in players join the back of the queue in order', () => {
    const s = replay([start(), checkIn('a'), checkIn('b'), checkIn('c')]);
    expect(s.queue).toEqual(['a', 'b', 'c']);
    expect(s.checkedIn).toEqual(['a', 'b', 'c']);
  });

  it('double check-in is a no-op', () => {
    const s = replay([start(), checkIn('a'), checkIn('a')]);
    expect(s.queue).toEqual(['a']);
  });

  it('departing removes from queue; sitting out freezes the spot', () => {
    const s = replay([
      start(), checkIn('a'), checkIn('b'), checkIn('c'),
      ev({ type: 'player-departed', playerId: 'b' }),
      ev({ type: 'player-sat-out', playerId: 'a' }),
    ]);
    expect(s.queue).toEqual(['a', 'c']); // a keeps position while sitting out
    expect(s.sittingOut).toEqual(['a']);
    expect(s.departed).toEqual(['b']);
  });

  it('player-returned clears sitting out', () => {
    const s = replay([
      start(), checkIn('a'),
      ev({ type: 'player-sat-out', playerId: 'a' }),
      ev({ type: 'player-returned', playerId: 'a' }),
    ]);
    expect(s.sittingOut).toEqual([]);
  });

  it('sit-out and depart are no-ops for a player currently on a court', () => {
    const four2: Pairs = [['a', 'c'], ['b', 'd']];
    const events = [start(), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), game(1, four2)];
    const s = replay([...events, ev({ type: 'player-sat-out', playerId: 'a' }), ev({ type: 'player-departed', playerId: 'a' })]);
    expect(s.sittingOut).toEqual([]);
    expect(s.departed).toEqual([]);
    expect(s.games[1]?.pairs).toEqual(four2);
  });
});

describe('games', () => {
  const four: Pairs = [['a', 'c'], ['b', 'd']];
  const base = () => [start(), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e')];

  it('game-started removes the four from the queue and occupies the court', () => {
    const s = replay([...base(), game(1, four)]);
    expect(s.queue).toEqual(['e']);
    expect(s.games[1]?.pairs).toEqual(four);
    expect(s.games[1]?.startedAt).toBeGreaterThan(0);
  });

  it('game-started on an occupied court or with a player not in queue is a no-op', () => {
    const s = replay([...base(), game(1, four), game(1, [['e', 'a'], ['b', 'c']])]);
    expect(s.queue).toEqual(['e']);
    expect(s.games[1]?.pairs).toEqual(four);
  });

  it('all-off finish returns all four to the back in lineup order and counts games', () => {
    const s = replay([...base(), game(1, four), finish(1)]);
    expect(s.queue).toEqual(['e', 'a', 'c', 'b', 'd']); // lineup order: pair 0 then pair 1
    expect(s.games[1]).toBeUndefined();
    expect(s.gamesPlayed).toEqual({ a: 1, b: 1, c: 1, d: 1 });
    expect(s.finishedGames).toHaveLength(1);
    expect(s.pairingCycle).toBe(1);
  });

  it('winners-stay finish puts winners at the queue front and losers at the back', () => {
    const s = replay([start(1, 'winners-stay', 3), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1, 0)]);
    // winners a and c to the front, losers b and d to the back, e was waiting
    expect(s.queue).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect(s.wins).toEqual({ a: 1, c: 1 });
    expect(s.consecutiveWins).toEqual({ a: 1, c: 1, b: 0, d: 0 });
  });

  it('winners-stay at the win cap sends both winners to the back', () => {
    const s = replay([start(1, 'winners-stay', 1), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1, 0)]);
    // cap 1: winners leave immediately. Losers to back first, then winners.
    expect(s.queue).toEqual(['e', 'b', 'd', 'a', 'c']);
    expect(s.consecutiveWins).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('winners-split finish also fronts the winners', () => {
    const s = replay([start(1, 'winners-split', 3), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1, 1)]);
    // winners b and d to the front, losers a and c to the back
    expect(s.queue).toEqual(['b', 'd', 'e', 'a', 'c']);
  });

  it('game-lineup-changed swaps the pairs of an active game', () => {
    const changed: Pairs = [['a', 'b'], ['c', 'd']];
    const s = replay([...base(), game(1, four), ev({ type: 'game-lineup-changed', court: 1, pairs: changed })]);
    expect(s.games[1]?.pairs).toEqual(changed);
  });

  it('lineup change can pull a player from the queue; the replaced player goes to the queue front', () => {
    const changed: Pairs = [['a', 'e'], ['b', 'd']];
    const s = replay([...base(), game(1, four), ev({ type: 'game-lineup-changed', court: 1, pairs: changed })]);
    expect(s.games[1]?.pairs).toEqual(changed);
    expect(s.queue).toEqual(['c']); // c came off the court, e came on
  });

  it('game-finished with an out of range winnerPair is a no-op, imported logs cannot crash replay', () => {
    const s = replay([...base(), game(1, four), { ...finish(1), winnerPair: 2 } as unknown as SessionEvent]);
    expect(s.games[1]?.pairs).toEqual(four);
    expect(s.gamesPlayed).toEqual({});
    expect(s.finishedGames).toHaveLength(0);
  });

  it('rule-changed mid game applies to the finish of a game started under the old rule', () => {
    const s = replay([...base(), game(1, four),
      ev({ type: 'rule-changed', template: 'winners-stay', config: { winCap: 3 } }),
      finish(1, 0)]);
    expect(s.queue).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect(s.wins).toEqual({ a: 1, c: 1 });
  });

  it('departing resets a stale win streak', () => {
    const s = replay([start(1, 'winners-stay', 3), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1, 0),
      ev({ type: 'player-departed', playerId: 'a' })]);
    expect(s.consecutiveWins['a']).toBe(0);
  });

  it('balanced and social finishes count the winner and send winners to the back first', () => {
    const s = replay([start(1, 'balanced', 3), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1, 1)]);
    expect(s.queue).toEqual(['e', 'b', 'd', 'a', 'c']); // winners b and d lead the four, nobody keeps the court
    expect(s.wins).toEqual({ b: 1, d: 1 });
    expect(s.consecutiveWins).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('a legacy casual finish without a winner keeps lineup order and records no win', () => {
    const s = replay([start(1, 'balanced', 3), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), finish(1)]);
    expect(s.queue).toEqual(['e', 'a', 'c', 'b', 'd']);
    expect(s.wins).toEqual({});
  });
});

describe('courts', () => {
  it('closing an occupied court returns its four to the queue front and voids the game', () => {
    const four: Pairs = [['a', 'c'], ['b', 'd']];
    const s = replay([start(), checkIn('a'), checkIn('b'), checkIn('c'), checkIn('d'), checkIn('e'),
      game(1, four), ev({ type: 'court-closed', court: 1 })]);
    expect(s.queue).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(s.closedCourts).toEqual([1]);
    expect(s.gamesPlayed).toEqual({}); // voided, not counted
    expect(s.finishedGames).toHaveLength(0);
  });

  it('court-reopened clears the closed flag', () => {
    const s = replay([start(), ev({ type: 'court-closed', court: 2 }), ev({ type: 'court-reopened', court: 2 })]);
    expect(s.closedCourts).toEqual([]);
  });

  it('court-closed with an out of range court number is a no-op', () => {
    const s = replay([start(2), ev({ type: 'court-closed', court: 9999 })]);
    expect(s.closedCourts).toEqual([]);
  });
});

describe('undo', () => {
  it('event-undone makes the reducer skip the target', () => {
    const c = checkIn('a');
    const s = replay([start(), c, ev({ type: 'event-undone', targetEventId: c.id })]);
    expect(s.queue).toEqual([]);
    expect(s.checkedIn).toEqual([]);
  });

  it('undoing an event-undone reinstates the original (redo)', () => {
    const c = checkIn('a');
    const u = ev({ type: 'event-undone', targetEventId: c.id });
    const s = replay([start(), c, u, ev({ type: 'event-undone', targetEventId: u.id })]);
    expect(s.queue).toEqual(['a']);
  });

  it('two undos of the same event keep it skipped even after one undo is itself undone', () => {
    const c = checkIn('a');
    const u1 = ev({ type: 'event-undone', targetEventId: c.id });
    const u2 = ev({ type: 'event-undone', targetEventId: c.id });
    const u3 = ev({ type: 'event-undone', targetEventId: u1.id });
    const s = replay([start(), c, u1, u2, u3]);
    expect(s.queue).toEqual([]);
  });
});

describe('court-added', () => {
  it('increments the court count during a live session only', () => {
    const s = replay([start(2), ev({ type: 'court-added' })]);
    expect(s.courtCount).toBe(3);
    const before = replay([ev({ type: 'court-added' })]);
    expect(before.courtCount).toBe(0);
  });
});

describe('staging', () => {
  const stage = (court: number, pairs: Pairs, auto?: true) => ev({ type: 'game-staged', court, pairs, ...(auto ? { auto } : {}) });
  const four = ['a', 'b', 'c', 'd'].map(checkIn);
  const boot = () => [start(2), ...['a', 'b', 'c', 'd', 'e'].map(checkIn)];

  it('game-staged pulls the four out of the queue onto the court', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']])]);
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'd']]);
    expect(s.queue).toEqual(['e']);
    expect(s.games[1]).toBeUndefined(); // staged is not live
  });

  it('restaging swaps one player and sends the replaced one to the queue front', () => {
    const s = replay([
      ...boot(),
      stage(1, [['a', 'c'], ['b', 'd']]),
      stage(1, [['a', 'c'], ['b', 'e']]),
    ]);
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'e']]);
    expect(s.queue).toEqual(['d']);
  });

  it('game-staged no-ops on a live court, a closed court, out of range, duplicates, and unqueued players', () => {
    const live = [...boot(), game(1, [['a', 'c'], ['b', 'd']])];
    expect(replay([...live, stage(1, [['a', 'c'], ['b', 'e']])]).staged[1]).toBeUndefined();
    expect(replay([...boot(), ev({ type: 'court-closed', court: 1 }), stage(1, [['a', 'c'], ['b', 'd']])]).staged[1]).toBeUndefined();
    expect(replay([...boot(), stage(9, [['a', 'c'], ['b', 'd']])]).staged[9]).toBeUndefined();
    expect(replay([...boot(), stage(1, [['a', 'a'], ['b', 'd']])]).staged[1]).toBeUndefined();
    expect(replay([...boot(), stage(1, [['a', 'c'], ['b', 'zz']])]).staged[1]).toBeUndefined();
  });

  it('game-staged refuses a player who is sitting out', () => {
    const s = replay([...boot(), ev({ type: 'player-sat-out', playerId: 'c' }), stage(1, [['a', 'c'], ['b', 'd']])]);
    expect(s.staged[1]).toBeUndefined();
  });

  it('game-unstaged returns the four to the queue front', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']]), ev({ type: 'game-unstaged', court: 1 })]);
    expect(s.staged[1]).toBeUndefined();
    expect(s.queue).toEqual(['a', 'c', 'b', 'd', 'e']);
  });

  it('game-unstaged on an unstaged court is a no-op', () => {
    const s = replay([...boot(), ev({ type: 'game-unstaged', court: 1 })]);
    expect(s.queue).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('game-started promotes the staged four even though they left the queue', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']]), game(1, [['a', 'c'], ['b', 'd']])]);
    expect(s.staged[1]).toBeUndefined();
    expect(s.games[1]?.pairs).toEqual([['a', 'c'], ['b', 'd']]);
    expect(s.queue).toEqual(['e']);
  });

  it('game-started with four who are neither staged nor queued is a no-op', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']]), game(2, [['a', 'c'], ['b', 'd']])]);
    expect(s.games[2]).toBeUndefined();
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'd']]);
  });

  it('checking in a staged player is a no-op, not a second queue slot', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']]), checkIn('a')]);
    expect(s.queue).toEqual(['e']);
  });

  it('departing or sitting out a staged player is refused: they are not in the queue', () => {
    const base = [...boot(), stage(1, [['a', 'c'], ['b', 'd']])];
    expect(replay([...base, ev({ type: 'player-departed', playerId: 'a' })]).departed).toEqual([]);
    expect(replay([...base, ev({ type: 'player-sat-out', playerId: 'a' })]).sittingOut).toEqual([]);
  });

  it('closing a court sends its staged four to the queue front too', () => {
    const s = replay([...boot(), stage(1, [['a', 'c'], ['b', 'd']]), ev({ type: 'court-closed', court: 1 })]);
    expect(s.staged[1]).toBeUndefined();
    expect(s.queue).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(s.closedCourts).toEqual([1]);
  });

  it('queue-swapped exchanges two queue positions and no-ops otherwise', () => {
    const s = replay([...boot(), ev({ type: 'queue-swapped', playerA: 'a', playerB: 'd' })]);
    expect(s.queue).toEqual(['d', 'b', 'c', 'a', 'e']);
    expect(replay([...boot(), ev({ type: 'queue-swapped', playerA: 'a', playerB: 'a' })]).queue).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(replay([...boot(), ev({ type: 'queue-swapped', playerA: 'a', playerB: 'zz' })]).queue).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('an old log with no staging replays with an empty staged record', () => {
    expect(four).toHaveLength(4);
    const s = replay([start(1), ...four, game(1, [['a', 'c'], ['b', 'd']])]);
    expect(s.staged).toEqual({});
    expect(s.games[1]?.pairs).toEqual([['a', 'c'], ['b', 'd']]);
  });
});
