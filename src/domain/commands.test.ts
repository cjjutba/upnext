import { describe, it, expect } from 'vitest';
import { replay } from './reducer';
import {
  startSession, finishGame, checkInPlayer, sitOutPlayer, returnPlayer,
  departPlayer, closeCourt, reopenCourt, changeRule, changeLineup, endSession, addCourt,
  startStagedGame, stageCourt, unstageCourt, substitutePlayer, shufflePairing, swapQueue,
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

/** Tap Start on every staged court, which is the only way a game goes live now. */
function startAll(log: SessionEvent[]): SessionEvent[] {
  let out = log;
  for (const court of Object.keys(replay(out).staged).map(Number)) {
    const events = startStagedGame(replay(out), court);
    if (events) out = [...out, ...seal(events)];
  }
  return out;
}

const live = (players: string[], template: RuleTemplate = 'all-off', courts = 1, winCap = 2) =>
  startAll(boot(players, template, courts, winCap));

describe('startSession', () => {
  it('emits session-started, check-ins, and stages courts pairing 1 and 3 versus 2 and 4', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const types = log.map((e) => e.type);
    expect(types).toEqual(['session-started', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'player-checked-in', 'game-staged']);
    const s = replay(log);
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'd']]);
    expect(s.games[1]).toBeUndefined(); // nothing starts on its own
    expect(s.queue).toEqual(['e']);
  });

  it('stages as many courts as players allow and leaves the rest empty', () => {
    const log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'all-off', 2);
    const s = replay(log);
    expect(s.staged[1]).toBeDefined();
    expect(s.staged[2]).toBeUndefined(); // only two waiting, never a game of three
  });

  it('duplicate player ids check in once and never phantom-stage', () => {
    const log = seal(startSession({ courts: 1, template: 'all-off', winCap: 3 }, ['a', 'a', 'b', 'c']));
    const s = replay(log);
    expect(s.checkedIn).toEqual(['a', 'b', 'c']);
    expect(s.staged[1]).toBeUndefined();
  });
});

describe('startStagedGame', () => {
  it('promotes the staged four and starts the clock', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const staged = replay(log).staged[1];
    log = [...log, ...seal(startStagedGame(replay(log), 1)!)];
    const s = replay(log);
    expect(s.games[1]?.pairs).toEqual(staged);
    expect(s.staged[1]).toBeUndefined();
    expect(s.queue).toEqual(['e']);
  });

  it('refuses a court with nothing staged and a court already live', () => {
    const log = live(['a', 'b', 'c', 'd'], 'all-off', 1);
    expect(startStagedGame(replay(log), 1)).toBeNull();
    expect(startStagedGame(replay(boot(['a', 'b', 'c'], 'all-off', 1)), 1)).toBeNull();
  });
});

describe('stageCourt and unstageCourt', () => {
  it('unstaging frees the four and staging fills the court again', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    log = [...log, ...seal(unstageCourt(replay(log), 1)!)];
    let s = replay(log);
    expect(s.staged[1]).toBeUndefined();
    expect(s.queue).toEqual(['a', 'c', 'b', 'd', 'e']);
    log = [...log, ...seal(stageCourt(s, 1)!)];
    s = replay(log);
    expect(s.staged[1]).toBeDefined();
    expect(s.queue).toEqual(['e']);
  });

  it('refuses unstaging an empty court and staging a busy or underfed one', () => {
    const log = live(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const s = replay(log);
    expect(unstageCourt(s, 1)).toBeNull();
    expect(stageCourt(s, 1)).toBeNull(); // live
    expect(stageCourt(replay(boot(['a', 'b', 'c'], 'all-off', 1)), 1)).toBeNull(); // three waiting
    expect(stageCourt(replay(boot(['a', 'b', 'c', 'd'], 'all-off', 1)), 9)).toBeNull(); // out of range
  });
});

describe('finishGame', () => {
  it('all-off: one event finishes and the court stages the next four', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all-off', 1);
    const more = finishGame(replay(log), 1);
    expect(more).not.toBeNull();
    log = [...log, ...seal(more!)];
    const s = replay(log);
    expect(s.staged[1]).toEqual([['e', 'g'], ['f', 'h']]);
    expect(s.games[1]).toBeUndefined(); // the four are on court, the clock is not running
    expect(s.queue).toEqual(['a', 'c', 'b', 'd']);
  });

  it('winners templates require a winner', () => {
    const log = live(['a', 'b', 'c', 'd'], 'winners-stay', 1);
    expect(finishGame(replay(log), 1)).toBeNull();
    expect(finishGame(replay(log), 1, 0)).not.toBeNull();
  });

  it('winners-stay: winners keep the court against the next two', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-stay', 1);
    log = [...log, ...seal(finishGame(replay(log), 1, 0)!)]; // a and c won
    const s = replay(log);
    expect(s.staged[1]).toEqual([['a', 'c'], ['e', 'f']]);
    expect(s.queue).toEqual(['b', 'd']);
  });

  it('winners-split: each winner anchors a new pair with a challenger', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-split', 1);
    log = [...log, ...seal(finishGame(replay(log), 1, 0)!)]; // a and c won
    const s = replay(log);
    expect(s.staged[1]).toEqual([['a', 'e'], ['c', 'f']]);
    expect(s.queue).toEqual(['b', 'd']);
  });

  it('winner priority follows the finished court, not the lowest numbered empty court', () => {
    // Engineer court 1 open and empty while court 2 holds the game: close 1
    // (its four go to the queue front and court 2 stages), then reopen 1
    // with fewer than four eligible left.
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f'], 'winners-stay', 2);
    log = [...log, ...seal(closeCourt(replay(log), 1)!)];
    log = [...log, ...seal(reopenCourt(replay(log), 1)!)];
    log = startAll(log);
    let s = replay(log);
    expect(s.games[1]).toBeUndefined();
    expect(s.games[2]).toBeDefined();
    const winners = s.games[2]!.pairs[0];
    log = [...log, ...seal(finishGame(s, 2, 0)!)];
    s = replay(log);
    expect(s.staged[2]?.[0]).toEqual(winners); // the winning pair stayed on court 2
    expect(s.staged[1]).toBeUndefined(); // court 1 did not steal the winner priority stage
  });

  it('a balanced finish carries the winner and counts the win', () => {
    let log = live(['a', 'b', 'c', 'd', 'e'], 'balanced', 1);
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
    const log = live(['a', 'b', 'c', 'd', 'e'], 'balanced', 1);
    expect(finishGame(replay(log), 1)).not.toBeNull();
  });

  it('balanced counts the picked winner without starting a streak, and the waiting four take the court', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'balanced', 1);
    const before = replay(log);
    const winners = before.games[1]!.pairs[0];
    log = [...log, ...seal(finishGame(before, 1, 0)!)];
    const after = replay(log);
    expect(after.wins).toEqual({ [winners[0]]: 1, [winners[1]]: 1 });
    expect(after.consecutiveWins).toEqual({ a: 0, b: 0, c: 0, d: 0 }); // no streaks outside the winners templates
    // all four went to the back, so the four who were waiting take the court
    expect(after.staged[1]!.flat().sort()).toEqual(['e', 'f', 'g', 'h']);
  });
});

describe('rotation fairness and preview stability', () => {
  it('a closed four under balanced partners every combination equally over six games', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'balanced', 1);
    const partnerCounts: Record<string, number> = {};
    for (let i = 0; i < 6; i += 1) {
      log = startAll(log);
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

  it('the up next preview equals the lineup a finish stages', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'social', 1);
    const before = replay(log);
    const preview = nextLineup(before, null, {});
    log = [...log, ...seal(finishGame(before, 1)!)];
    expect(replay(log).staged[1]).toEqual(preview);
  });
});

describe('addCourt', () => {
  it('adds a court during a live session and stages it when players wait', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all-off', 1);
    let s = replay(log);
    expect(s.staged[2]).toBeUndefined();
    log = [...log, ...seal(addCourt(s)!)];
    s = replay(log);
    expect(s.courtCount).toBe(2);
    expect(s.staged[2]).toEqual([['e', 'g'], ['f', 'h']]);
    expect(addCourt(replay(seal(startSession({ courts: 1, template: 'all-off', winCap: 3 }, []))))).not.toBeNull();
  });

  it('refuses before start and after end', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    log = [...log, ...seal(endSession(replay(log))!)];
    expect(addCourt(replay(log))).toBeNull();
  });
});

describe('ratings threading', () => {
  it('finishGame under balanced uses ratings for the next staged pairing', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'balanced', 1);
    const ratings = { e: 5, f: 5, g: 1, h: 1 };
    log = [...log, ...seal(finishGame(replay(log), 1, undefined, ratings)!)];
    const s = replay(log);
    expect(s.staged[1]).toEqual([['e', 'g'], ['f', 'h']]); // 5+1 vs 5+1, imbalance 0
  });
});

describe('roster commands', () => {
  it('checkInPlayer auto-stages when the fourth player arrives', () => {
    let log = boot(['a', 'b', 'c'], 'all-off', 1);
    expect(replay(log).staged[1]).toBeUndefined();
    log = [...log, ...seal(checkInPlayer(replay(log), 'd')!)];
    expect(replay(log).staged[1]).toBeDefined();
  });

  it('sitOutPlayer blocks a stage and returnPlayer triggers it', () => {
    let log = boot(['a', 'b', 'c'], 'all-off', 1); // three players: the court cannot stage yet
    log = [...log, ...seal(sitOutPlayer(replay(log), 'a')!)];
    let s = replay(log);
    expect(s.sittingOut).toEqual(['a']);
    log = [...log, ...seal(checkInPlayer(s, 'd')!)];
    s = replay(log);
    expect(s.staged[1]).toBeUndefined(); // three eligible, the sit-out froze the fourth
    expect(s.queue).toEqual(['a', 'b', 'c', 'd']); // frozen spot kept
    log = [...log, ...seal(returnPlayer(s, 'a')!)];
    expect(replay(log).staged[1]).toBeDefined();
  });

  it('departPlayer refuses players who are mid game', () => {
    const s = replay(live(['a', 'b', 'c', 'd'], 'all-off', 1));
    expect(departPlayer(s, 'a')).toBeNull();
  });

  it('departing a staged player substitutes the next in line and then removes them', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1); // a c vs b d staged, e waiting
    const events = departPlayer(replay(log), 'a')!;
    expect(events.map((e) => e.type)).toEqual(['game-staged', 'player-departed']);
    log = [...log, ...seal(events)];
    const s = replay(log);
    expect(s.staged[1]).toEqual([['e', 'c'], ['b', 'd']]); // the replacement takes the same slot
    expect(s.departed).toEqual(['a']);
    expect(s.queue).toEqual([]);
  });

  it('departing a staged player with nobody waiting clears the court', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    const events = departPlayer(replay(log), 'a')!;
    expect(events.map((e) => e.type)).toEqual(['game-unstaged', 'player-departed']);
    log = [...log, ...seal(events)];
    const s = replay(log);
    expect(s.staged[1]).toBeUndefined();
    expect(s.queue).toEqual(['c', 'b', 'd']);
    expect(s.departed).toEqual(['a']);
  });

  it('sitting out a staged player pulls them off the court first', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const events = sitOutPlayer(replay(log), 'c')!;
    expect(events.map((e) => e.type)).toEqual(['game-staged', 'player-sat-out']);
    log = [...log, ...seal(events)];
    const s = replay(log);
    expect(s.staged[1]).toEqual([['a', 'e'], ['b', 'd']]);
    expect(s.sittingOut).toEqual(['c']);
    expect(s.queue).toEqual(['c']);
  });
});

describe('court commands', () => {
  it('closeCourt voids the game and reopening stages again', () => {
    let log = live(['a', 'b', 'c', 'd'], 'all-off', 1);
    log = [...log, ...seal(closeCourt(replay(log), 1)!)];
    let s = replay(log);
    expect(s.closedCourts).toEqual([1]);
    expect(s.queue).toHaveLength(4);
    log = [...log, ...seal(reopenCourt(s, 1)!)];
    expect(replay(log).staged[1]).toBeDefined();
  });
});

describe('substitutePlayer and shufflePairing', () => {
  it('swaps a player into a staged lineup in place', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const events = substitutePlayer(replay(log), 1, 'd', 'e')!;
    expect(events.map((e) => e.type)).toEqual(['game-staged']);
    log = [...log, ...seal(events)];
    const s = replay(log);
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'e']]);
    expect(s.queue).toEqual(['d']);
  });

  it('swaps a player into a live lineup through game-lineup-changed', () => {
    let log = live(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const events = substitutePlayer(replay(log), 1, 'd', 'e')!;
    expect(events.map((e) => e.type)).toEqual(['game-lineup-changed']);
    log = [...log, ...seal(events)];
    expect(replay(log).games[1]?.pairs).toEqual([['a', 'c'], ['b', 'e']]);
  });

  it('refuses an empty court, a player not on the court, and a replacement who is unavailable', () => {
    const s = replay(boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1));
    expect(substitutePlayer(s, 2, 'd', 'e')).toBeNull();
    expect(substitutePlayer(s, 1, 'zz', 'e')).toBeNull();
    expect(substitutePlayer(s, 1, 'd', 'a')).toBeNull(); // already on the court
    expect(substitutePlayer(s, 1, 'd', 'zz')).toBeNull();
  });

  it('shufflePairing cycles the three partitions of the staged four', () => {
    let log = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    const seen: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      seen.push(JSON.stringify(replay(log).staged[1]));
      log = [...log, ...seal(shufflePairing(replay(log), 1)!)];
    }
    expect(new Set(seen).size).toBe(3); // three partitions, then back to the first
    expect(seen[0]).toBe(seen[3]);
    expect(shufflePairing(replay(live(['a', 'b', 'c', 'd'], 'all-off', 1)), 1)).toBeNull();
  });
});

describe('swapQueue', () => {
  it('exchanges two waiting players and refuses anyone not waiting', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 'all-off', 1);
    let s = replay(log);
    expect(s.queue).toEqual(['e', 'f', 'g', 'h', 'i']);
    expect(swapQueue(s, 'a', 'e')).toBeNull(); // a is staged, not waiting
    expect(swapQueue(s, 'e', 'e')).toBeNull();
    log = [...log, ...seal(swapQueue(s, 'e', 'i')!)];
    s = replay(log);
    expect(s.queue).toEqual(['i', 'f', 'g', 'h', 'e']);
  });
});

describe('changeLineup', () => {
  it('swaps pairs of an active game, refuses empty courts, and never stages', () => {
    let log = live(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
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

  it('skips the auto stage a finish triggers, so one undo reverts the win and the stage together', () => {
    let log = live(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'all-off', 1);
    const before = replay(log);
    const batch = seal(finishGame(before, 1, 0)!);
    expect(batch.map((e) => e.type)).toEqual(['game-finished', 'game-staged']);
    log = [...log, ...batch];
    expect(undoTarget(log)).toBe(batch[0].id); // the finish, not the stage it caused
    log = [...log, ...seal([{ type: 'event-undone', targetEventId: undoTarget(log)!, sessionId: log[0].sessionId }])];
    expect(replay(log)).toEqual(before);
  });

  it('a manual stage is undoable on its own, and so is a start', () => {
    let log = boot(['a', 'b', 'c', 'd', 'e'], 'all-off', 1);
    const sub = seal(substitutePlayer(replay(log), 1, 'd', 'e')!);
    log = [...log, ...sub];
    expect(undoTarget(log)).toBe(sub[0].id);
    const start = seal(startStagedGame(replay(log), 1)!);
    log = [...log, ...start];
    expect(undoTarget(log)).toBe(start[0].id);
    log = [...log, ...seal([{ type: 'event-undone', targetEventId: start[0].id, sessionId: log[0].sessionId }])];
    const s = replay(log);
    expect(s.games[1]).toBeUndefined(); // back to staged, the clock never ran
    expect(s.staged[1]).toEqual([['a', 'c'], ['b', 'e']]);
  });
});

describe('describeEvent', () => {
  it('produces the undo pill label', () => {
    const [started] = boot(['a', 'b', 'c', 'd'], 'all-off', 1);
    expect(describeEvent({ ...started, type: 'game-finished', court: 2 } as SessionEvent)).toBe('Undo: court 2 finished');
    expect(describeEvent({ ...started, type: 'game-finished', court: 1, winnerPair: 1 } as SessionEvent)).toBe('Undo: court 1, team 2 won');
    expect(describeEvent({ ...started, type: 'player-checked-in', playerId: 'x' } as SessionEvent)).toBe('Undo: check-in');
    expect(describeEvent({ ...started, type: 'game-started', court: 3 } as SessionEvent)).toBe('Undo: court 3 started');
    expect(describeEvent({ ...started, type: 'game-staged', court: 3 } as SessionEvent)).toBe('Undo: court 3 lineup');
    expect(describeEvent({ ...started, type: 'game-unstaged', court: 3 } as SessionEvent)).toBe('Undo: court 3 cleared');
    expect(describeEvent({ ...started, type: 'queue-swapped', playerA: 'x', playerB: 'y' } as SessionEvent)).toBe('Undo: queue order');
  });
});
