import { describe, it, expect } from 'vitest';
import { announceBatch, courtPhrase, getReadyPhrase, leaderPhrase, pairPhrase, podiumPhrase } from './announce';
import { standings } from './standings';
import { replay } from './reducer';
import { startSession, finishGame, closeCourt, changeLineup, startStagedGame, type CommandEvent } from './commands';
import { emptyState } from './types';
import type { Pairs, SessionEvent, SessionState } from './types';

const NAMES: Record<string, string> = {
  a: 'Alice', b: 'Bob', c: 'Carol', d: 'Dave', e: 'Eve', f: 'Frank', g: 'Grace', h: 'Henry',
};
const nameOf = (id: string) => NAMES[id] ?? id;

let n = 0;
function seal(events: CommandEvent[]): SessionEvent[] {
  return events.map((ev) => {
    n += 1;
    return { ...ev, id: `evt-${String(n).padStart(6, '0')}`, deviceId: 'd', seq: n, ts: n, v: 1 } as SessionEvent;
  });
}

const boot = (players: string[], template: 'all-off' | 'balanced' | 'winners-stay' = 'balanced', courts = 1) =>
  seal(startSession({ courts, template, winCap: 2 }, players));

/** Tap Start on every staged court. Staging is silent, so the court call arrives here. */
function startAll(log: SessionEvent[]): { log: SessionEvent[]; batch: SessionEvent[] } {
  let out = log;
  let batch: SessionEvent[] = [];
  for (const court of Object.keys(replay(out).staged).map(Number)) {
    const events = startStagedGame(replay(out), court);
    if (!events) continue;
    batch = seal(events);
    out = [...out, ...batch];
  }
  return { log: out, batch };
}

describe('phrase builders', () => {
  it('names a pair and a matchup', () => {
    expect(pairPhrase(['a', 'b'], nameOf)).toBe('Alice and Bob');
    expect(courtPhrase(2, [['a', 'b'], ['c', 'd']], nameOf))
      .toBe('Court 2. Alice and Bob versus Carol and Dave. Please proceed to court 2.');
  });

  it('calls four people to get ready, with and without a court', () => {
    expect(getReadyPhrase([['e', 'f'], ['g', 'h']], nameOf))
      .toBe('Get ready. Up next. Team one, Eve and Frank. Versus team two, Grace and Henry.');
    expect(getReadyPhrase([['e', 'f'], ['g', 'h']], nameOf, 2))
      .toBe('Get ready. Court 2. Team one, Eve and Frank. Versus team two, Grace and Henry.');
  });
});

describe('announceBatch', () => {
  it('says nothing when a session start stages a court', () => {
    const log = boot(['a', 'b', 'c', 'd']);
    expect(announceBatch(log, replay(log), nameOf)).toEqual([]);
  });

  it('reads the court assignment on the Start tap', () => {
    const { log, batch } = startAll(boot(['a', 'b', 'c', 'd']));
    expect(announceBatch(batch, replay(log), nameOf))
      .toEqual(['Court 1. Alice and Carol versus Bob and Dave. Please proceed to court 1.']);
  });

  it('reads the winning pair and stays quiet about the stage it triggered', () => {
    let { log } = startAll(boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
    const batch = seal(finishGame(replay(log), 1, 0)!);
    log = [...log, ...batch];
    const lines = announceBatch(batch, replay(log), nameOf);
    expect(lines).toEqual(['Court 1. Alice and Carol win.']);
  });

  it('swallows "Game over" when the same batch stages the court again', () => {
    let { log } = startAll(boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
    const batch = seal(finishGame(replay(log), 1)!);
    log = [...log, ...batch];
    expect(announceBatch(batch, replay(log), nameOf)).toEqual([]);
  });

  it('falls back to "Game over" for a finish that stages nothing after it', () => {
    // finishGame pairs a finish with its stage whenever four are waiting, so this
    // shape reaches announceBatch when the queue has run dry. It must still read cleanly.
    let log = startAll(boot(['a', 'b', 'c', 'd'])).log;
    const state = replay(log);
    const batch = seal([{ type: 'game-finished', court: 1, sessionId: state.sessionId! }]);
    log = [...log, ...batch];
    expect(announceBatch(batch, replay(log), nameOf)).toEqual(['Court 1. Game over.']);
  });

  it('reads a closed court and a lineup change', () => {
    let log = startAll(boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'balanced', 2)).log;
    const swap = seal(changeLineup(replay(log), 1, [['a', 'd'], ['c', 'b']] as Pairs)!);
    log = [...log, ...swap];
    expect(announceBatch(swap, replay(log), nameOf))
      .toEqual(['Court 1. Lineup change. Alice and Dave versus Carol and Bob.']);
    const close = seal(closeCourt(replay(log), 2)!);
    log = [...log, ...close];
    expect(announceBatch(close, replay(log), nameOf)[0]).toBe('Court 2 is closed.');
  });

  it('stays silent for check-ins and for undo', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e']);
    const state = replay(log);
    const quiet = seal([
      { type: 'player-checked-in', playerId: 'f', sessionId: state.sessionId! },
      { type: 'player-sat-out', playerId: 'e', sessionId: state.sessionId! },
      { type: 'event-undone', targetEventId: log[log.length - 1].id, sessionId: state.sessionId! },
    ]);
    expect(announceBatch(quiet, state, nameOf)).toEqual([]);
  });
});

describe('podium', () => {
  const decided = (over: Partial<SessionState>): SessionState => ({ ...emptyState(), ...over });

  it('reads the top three with wins, games, and win rate', () => {
    const state = decided({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 2, b: 2, c: 2, d: 2 },
      finishedGames: [
        { court: 1, pairs: [['a', 'b'], ['c', 'd']], winnerPair: 0, startedAt: 0, endedAt: 1 },
        { court: 1, pairs: [['a', 'c'], ['b', 'd']], winnerPair: 0, startedAt: 2, endedAt: 3 },
      ],
    });
    expect(podiumPhrase(standings(state, nameOf), nameOf)).toBe(
      'Session complete. In first place, Alice, with 2 wins from 2 games, 100 percent.'
      + ' In second place, Bob, with 1 win from 2 games, 50 percent.'
      + ' Also in second place, Carol, with 1 win from 2 games, 50 percent.',
    );
  });

  it('reads a shared rank as a tie rather than walking the ordinal down', () => {
    const state = decided({
      checkedIn: ['a', 'b', 'c', 'd'],
      gamesPlayed: { a: 1, b: 1, c: 1, d: 1 },
      finishedGames: [{ court: 1, pairs: [['a', 'b'], ['c', 'd']], winnerPair: 0, startedAt: 0, endedAt: 1 }],
    });
    expect(podiumPhrase(standings(state, nameOf), nameOf)).toBe(
      'Session complete. In first place, Alice, with 1 win from 1 game, 100 percent.'
      + ' Also in first place, Bob, with 1 win from 1 game, 100 percent.'
      + ' In third place, Carol, with 0 wins from 1 game, 0 percent.',
    );
  });

  it('reads fewer than three when fewer than three have a decided game', () => {
    const state = decided({
      checkedIn: ['a', 'b', 'e'],
      gamesPlayed: { a: 1, b: 1 },
      finishedGames: [{ court: 1, pairs: [['a', 'a2'], ['b', 'b2']], winnerPair: 0, startedAt: 0, endedAt: 1 }],
    });
    const said = podiumPhrase(standings(state, nameOf), nameOf);
    expect(said).toContain('In first place, Alice');
    expect(said).toContain('In second place, Bob');
    expect(said).not.toContain('third');
  });

  it('says so when nothing was decided', () => {
    const state = decided({ checkedIn: ['a', 'b'], gamesPlayed: { a: 1, b: 1 } });
    expect(podiumPhrase(standings(state, nameOf), nameOf))
      .toBe('Session complete. No games finished with a winner, so there is no podium.');
    expect(leaderPhrase(standings(state, nameOf), nameOf))
      .toBe('Live standings. No games have been decided yet.');
  });
});
