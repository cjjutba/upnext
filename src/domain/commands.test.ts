import { describe, it, expect } from 'vitest';
import { replay } from './reducer';
import {
  startSession, finishGame, checkInPlayer, sitOutPlayer, returnPlayer,
  departPlayer, closeCourt, reopenCourt, changeRule, changeLineup, endSession, addCourt,
  undoTarget, redoTarget, describeEvent, type CommandEvent,
} from './commands';
import { nextLineup } from './templates';
import type { SessionEvent, EventPayload, Pairs, RuleTemplate } from './types';

let n = 0;
/** Give command events real looking envelopes so replay can consume them. */
function seal(events: CommandEvent[]): SessionEvent[] {
  return events.map((e) => {
    n += 1;
    return { ...e, id: `evt-${String(n).padStart(6, '0')}`, deviceId: 'd', seq: n, ts: n, v: 1 } as SessionEvent;
  });
}

const boot = (players: string[], template: RuleTemplate = 'all-off', courts = 1, winCap = 2) =>
  seal(startSession({ courts, template, winCap }, players));

describe('startSession', () => {
  it('emits session-started, check-ins, and auto-fills courts pairing 1 and 3 versus 2 and 4', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const types = log.map((e) => e.type);
    expect(types).toEqual(['session-started', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'game-started']);
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual([['a', 'c'], ['b', 'd']]);
    expect(s.queue).toEqual(['e']);
  });

  it('fills as many courts as players allow and leaves the rest empty', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'all-off', 2);
    const s = replay(log);
    expect(s.games[1]).toBeDefined();
    expect(s.games[2]).toBeUndefined(); // only two waiting, never a game of three
  });

  it('duplicate player ids check in once and never phantom-fill', () => {
    const log = seal(startSession({ courts: 1, template: 'all-off', winCap: 3 }, ['a', 'a', 'b', 'c']));
    const s = replay(log);
    expect(s.checkedIn).toEqual(['a', 'b', 'c']);
    expect(s.games[1]).toBeUndefined();
  });
});

describe('finishGame', () => {
  it('all-off: one event finishes and the court refills from the queue', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all-off', 1);
    const more = finishGame(replay(log), 1);
    expect(more).not.toBeNull();
    log = [...log, ...seal(more!)];
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual([['e', 'g'], ['f', 'h']]);
    expect(s.queue).toEqual(['a', 'c', 'b', 'd']);
  });

  it('carries an optional score onto the finish event and into the finished game', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    const more = finishGame(replay(log), 1, 0, {}, '11-7');
    expect(more).not.toBeNull();
    expect(more![0]).toMatchObject({ type: 'game-finished', score: '11-7' });
    log = [...log, ...seal(more!)];
    expect(replay(log).finishedGames[0].score).toBe('11-7');
  });

  it('winners templates require a winner', () => {
    const log = boot(['a', 'b', 'c', 'd'], 'winners-stay', 1);
    expect(finishGame(replay(log), 1)).toBeNull();
    expect(finishGame(replay(log), 1, 0)).not.toBeNull();
  });

  it('winners-stay: winners keep the court against the next two', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-stay', 1);
    log = [...log, ...seal(finishGame(replay(log), 1, 0)!)]; // a and c won
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual([['a', 'c'], ['e', 'f']]);
    expect(s.queue).toEqual(['b', 'd']);
  });

  it('winners-split: each winner anchors a new pair with a challenger', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-split', 1);
    log = [...log, ...seal(finishGame(replay(log), 1, 0)!)]; // a and c won
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual([['a', 'e'], ['c', 'f']]);
    expect(s.queue).toEqual(['b', 'd']);
  });

  it('winner priority follows the finished court, not the lowest numbered empty court', () => {
    // Engineer court 1 open and empty while court 2 holds the game: close 1
    // (its four go to the queue front and court 2 auto-fills), then reopen 1
    // with fewer than four eligible left.
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-stay', 2);
    log = [...log, ...seal(closeCourt(replay(log), 1)!)];
    log = [...log, ...seal(reopenCourt(replay(log), 1)!)];
    let s = replay(log);
    expect(s.games[1]).toBeUndefined();
    expect(s.games[2]).toBeDefined();
    const winners = s.games[2]!.pairs[0];
    log = [...log, ...seal(finishGame(s, 2, 0)!)];
    s = replay(log);
    expect(s.games[2]?.pairs[0]).toEqual(winners); // the winning pair stayed on court 2
    expect(s.games[1]).toBeUndefined(); // court 1 did not steal the winner priority fill
  });

  it('a balanced finish carries the winner and counts the win', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'balanced', 1);
    const s = replay(log);
    const winners = s.games[1]!.pairs[1];
    const events = finishGame(s, 1, 1);
    expect(events).not.toBeNull();
    const finish = events!.find((e) => e.type === 'game-finished')!;
    expect(finish.type === 'game-finished' && finish.winnerPair).toBe(1);
    log = [...log, ...seal(events!)];
    expect(replay(log).wins).toEqual({ [winners[0]]: 1, [winners[1]]: 1 });
  });

  it('a balanced finish without a winner is still accepted', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e'], 'balanced', 1);
    expect(finishGame(replay(log), 1)).not.toBeNull();
  });

  it('balanced counts the picked winner without starting a streak, and the waiting four take the court', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'balanced', 1);
    const before = replay(log);
    const winners = before.games[1]!.pairs[0];
    log = [...log, ...seal(finishGame(before, 1, 0)!)];
    const after = replay(log);
    expect(after.wins).toEqual({ [winners[0]]: 1, [winners[1]]: 1 });
    expect(after.consecutiveWins).toEqual({ a: 0, b: 0, c: 0, d: 0 }); // no streaks outside the winners templates
    // all four went to the back, so the four who were waiting take the court
    expect(after.games[1]!.pairs.flat().sort()).toEqual(['e', 'f', 'g', 'h']);
  });
});

describe('rotation fairness and preview stability', () => {
  it('a closed four under balanced partners every combination equally over six games', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'balanced', 1);
    const partnerCounts: Record<string, number> = {};
    for (let i = 0; i < 6; i += 1) {
      const s = replay(log);
      const pairs = s.games[1]!.pairs;
      for (const [x, y] of pairs) {
        const k = [x, y].sort().join('|');
        partnerCounts[k] = (partnerCounts[k] ?? 0) + 1;
      }
      log = [...log, ...seal(finishGame(s, 1)!)];
    }
    expect(Object.values(partnerCounts).sort()).toEqual([2, 2, 2, 2, 2, 2]);
  });

  it('the up next preview equals the fill a finish produces', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'social', 1);
    const before = replay(log);
    const preview = nextLineup(before, null, {});
    log = [...log, ...seal(finishGame(before, 1)!)];
    expect(replay(log).games[1]?.pairs).toEqual(preview);
  });
});

describe('addCourt', () => {
  it('adds a court during a live session and fills it when players wait', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all-off', 1);
    let s = replay(log);
    expect(s.games[2]).toBeUndefined();
    log = [...log, ...seal(addCourt(s)!)];
    s = replay(log);
    expect(s.courtCount).toBe(2);
    expect(s.games[2]?.pairs).toEqual([['e', 'g'], ['f', 'h']]);
    expect(addCourt(replay(seal(startSession({ courts: 1, template: 'all-off', winCap: 3 }, []))))).not.toBeNull();
  });

  it('refuses before start and after end', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    log = [...log, ...seal(endSession(replay(log))!)];
    expect(addCourt(replay(log))).toBeNull();
  });
});

describe('ratings threading', () => {
  it('finishGame under balanced uses ratings for the refill pairing', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'balanced', 1);
    const ratings = { e: 5, f: 5, g: 1, h: 1 };
    log = [...log, ...seal(finishGame(replay(log), 1, undefined, ratings)!)];
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual([['e', 'g'], ['f', 'h']]); // 5+1 vs 5+1, imbalance 0
  });
});

describe('roster commands', () => {
  it('checkInPlayer auto-fills when the fourth player arrives', () => {
    let log = boot(['a', 'b', 'c'], 'all-off', 1);
    expect(replay(log).games[1]).toBeUndefined();
    log = [...log, ...seal(checkInPlayer(replay(log), 'd')!)];
    expect(replay(log).games[1]).toBeDefined();
  });

  it('sitOutPlayer blocks a fill and returnPlayer triggers it', () => {
    let log = boot(['a', 'b', 'c'], 'all-off', 1); // three players: the court cannot fill yet
    log = [...log, ...seal(sitOutPlayer(replay(log), 'a')!)];
    let s = replay(log);
    expect(s.sittingOut).toEqual(['a']);
    log = [...log, ...seal(checkInPlayer(s, 'd')!)];
    s = replay(log);
    expect(s.games[1]).toBeUndefined(); // three eligible, the sit-out froze the fourth
    expect(s.queue).toEqual(['a', 'b', 'c', 'd']); // frozen spot kept
    log = [...log, ...seal(returnPlayer(s, 'a')!)];
    expect(replay(log).games[1]).toBeDefined();
  });

  it('departPlayer refuses players who are mid game', () => {
    const s = replay(boot(['a', 'b', 'c', 'd'], 'all-off', 1));
    expect(departPlayer(s, 'a')).toBeNull();
  });
});

describe('court commands', () => {
  it('closeCourt voids the game and reopening refills', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    log = [...log, ...seal(closeCourt(replay(log), 1)!)];
    let s = replay(log);
    expect(s.closedCourts).toEqual([1]);
    expect(s.queue).toHaveLength(4);
    log = [...log, ...seal(reopenCourt(s, 1)!)];
    expect(replay(log).games[1]).toBeDefined();
  });
});

describe('changeLineup', () => {
  it('swaps pairs of an active game, refuses empty courts, and never fills', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    let s = replay(log);
    expect(changeLineup(s, 2, s.games[1]!.pairs)).toBeNull();
    const g = s.games[1]!.pairs;
    const swapped: Pairs = [[g[0][0], g[1][0]], [g[0][1], g[1][1]]];
    log = [...log, ...seal(changeLineup(s, 1, swapped)!)];
    s = replay(log);
    expect(s.games[1]?.pairs).toEqual(swapped);
    expect(s.queue).toEqual(['e']);
  });
});

describe('rule and session commands', () => {
  it('changeRule emits rule-changed and endSession closes the log', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    log = [...log, ...seal(changeRule(replay(log), 'winners-stay', 3)!)];
    expect(replay(log).rule.template).toBe('winners-stay');
    log = [...log, ...seal(endSession(replay(log))!)];
    const s = replay(log);
    expect(s.ended).toBe(true);
    expect(endSession(s)).toBeNull();
  });

  it('re-selecting the active rule is refused as a no-op', () => {
    const s = replay(boot(['a', 'b', 'c', 'd'], 'all-off', 1));
    expect(changeRule(s, 'all-off', s.rule.winCap)).toBeNull();
    expect(changeRule(s, 'all-off', s.rule.winCap + 1)).not.toBeNull();
  });
});

describe('undo and redo targeting', () => {
  it('undo targets the newest effective action, never session-started; redo targets the undo; a new action clears redo', () => {
    let log = boot(['a', 'b'], 'all-off', 1);
    const target = undoTarget(log);
    expect(target).toBe(log[log.length - 1].id); // the last check-in
    const undo: EventPayload & { sessionId: string } = { type: 'event-undone', targetEventId: target!, sessionId: log[0].sessionId };
    log = [...log, ...seal([undo])];
    expect(replay(log).queue).toEqual(['a']);
    expect(redoTarget(log)).toBe(log[log.length - 1].id);
    log = [...log, ...seal(checkInPlayer(replay(log), 'c')!)];
    expect(redoTarget(log)).toBeNull();
    // undoing everything down to session-started returns null
    let guard = 0;
    while (undoTarget(log) && guard < 20) {
      log = [...log, ...seal([{ type: 'event-undone', targetEventId: undoTarget(log)!, sessionId: log[0].sessionId }])];
      guard += 1;
    }
    expect(replay(log).queue).toEqual([]);
    expect(replay(log).started).toBe(true);
  });
});

describe('describeEvent', () => {
  it('produces the undo pill label', () => {
    const [started] = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    expect(describeEvent({ ...started, type: 'game-finished', court: 2 } as SessionEvent)).toBe('Undo: court 2 finished');
    expect(describeEvent({ ...started, type: 'game-finished', court: 1, winnerPair: 1 } as SessionEvent)).toBe('Undo: court 1, team 2 won');
    expect(describeEvent({ ...started, type: 'player-checked-in', playerId: 'x' } as SessionEvent)).toBe('Undo: check-in');
  });
});
