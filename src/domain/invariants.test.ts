import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { replay, isPlaying } from './reducer';
import * as cmd from './commands';
import type { SessionEvent, SessionState } from './types';

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'];

let n = 0;
function seal(events: cmd.CommandEvent[]): SessionEvent[] {
  return events.map((e) => {
    n += 1;
    return { ...e, id: `evt-${String(n).padStart(8, '0')}`, deviceId: 'd', seq: n, ts: n, v: 1 } as SessionEvent;
  });
}

interface Op {
  kind: 'finish' | 'checkin' | 'sit' | 'return' | 'depart' | 'close' | 'reopen' | 'undo';
  pick: number;
  winner: 0 | 1;
}

const opArb = fc.record({
  kind: fc.constantFrom<Op['kind']>('finish', 'checkin', 'sit', 'return', 'depart', 'close', 'reopen', 'undo'),
  pick: fc.nat(29),
  winner: fc.constantFrom<0 | 1>(0, 1),
});

const template = fc.constantFrom<'all-off' | 'winners-stay' | 'winners-split'>('all-off', 'winners-stay', 'winners-split');

function run(ops: Op[], tpl: 'all-off' | 'winners-stay' | 'winners-split'): SessionEvent[] {
  let log = seal(cmd.startSession({ courts: 2, template: tpl, winCap: 2 }, PLAYERS.slice(0, 6)));
  for (const op of ops) {
    const s = replay(log);
    let out: cmd.CommandEvent[] | null = null;
    const from = <T,>(arr: T[]): T | undefined => arr[op.pick % Math.max(arr.length, 1)];
    switch (op.kind) {
      case 'finish': {
        const courts = Object.keys(s.games).map(Number);
        const court = from(courts);
        if (court !== undefined) out = cmd.finishGame(s, court, s.rule.template === 'all-off' ? undefined : op.winner);
        break;
      }
      case 'checkin': {
        const cand = PLAYERS.filter((p) => !s.queue.includes(p) && !isPlaying(s, p));
        const p = from(cand);
        if (p) out = cmd.checkInPlayer(s, p);
        break;
      }
      case 'sit': {
        const p = from(s.queue.filter((x) => !s.sittingOut.includes(x)));
        if (p) out = cmd.sitOutPlayer(s, p);
        break;
      }
      case 'return': {
        const p = from(s.sittingOut);
        if (p) out = cmd.returnPlayer(s, p);
        break;
      }
      case 'depart': {
        const p = from(s.queue);
        if (p) out = cmd.departPlayer(s, p);
        break;
      }
      case 'close': {
        const open = Array.from({ length: s.courtCount }, (_, i) => i + 1).filter((c) => !s.closedCourts.includes(c));
        const c = from(open);
        if (c !== undefined) out = cmd.closeCourt(s, c);
        break;
      }
      case 'reopen': {
        const c = from(s.closedCourts);
        if (c !== undefined) out = cmd.reopenCourt(s, c);
        break;
      }
      case 'undo': {
        const t = cmd.undoTarget(log);
        if (t && s.sessionId) out = [{ type: 'event-undone', targetEventId: t, sessionId: s.sessionId }];
        break;
      }
    }
    if (out) log = [...log, ...seal(out)];
  }
  return log;
}

function checkInvariants(s: SessionState): void {
  const playing = Object.values(s.games).flatMap((g) => [g.pairs[0][0], g.pairs[0][1], g.pairs[1][0], g.pairs[1][1]]);
  // no player on two courts at once
  expect(new Set(playing).size).toBe(playing.length);
  // every open court has exactly four distinct players
  for (const g of Object.values(s.games)) {
    const four = [g.pairs[0][0], g.pairs[0][1], g.pairs[1][0], g.pairs[1][1]];
    expect(new Set(four).size).toBe(4);
  }
  // queue and courts are disjoint
  for (const p of playing) expect(s.queue).not.toContain(p);
  // conservation: every checked-in, non departed player is in exactly one place
  for (const p of s.checkedIn.filter((x) => !s.departed.includes(x))) {
    expect(s.queue.includes(p) !== playing.includes(p)).toBe(true);
  }
  // sitting out players keep a queue spot
  for (const p of s.sittingOut) expect(s.queue).toContain(p);
  // closed courts are never occupied
  for (const c of s.closedCourts) expect(s.games[c]).toBeUndefined();
}

describe('invariants over random command sequences', () => {
  it('holds invariants and replays deterministically', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 60 }), template, (ops, tpl) => {
        const log = run(ops as Op[], tpl);
        const s1 = replay(log);
        checkInvariants(s1);
        const s2 = replay(log);
        expect(s2).toEqual(s1); // determinism
      }),
      { numRuns: 60 },
    );
  });

  it('undo then redo restores the exact state', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 3, maxLength: 40 }), template, (ops, tpl) => {
        let log = run(ops as Op[], tpl);
        const before = replay(log);
        const target = cmd.undoTarget(log);
        if (!target || !before.sessionId) return;
        log = [...log, ...seal([{ type: 'event-undone', targetEventId: target, sessionId: before.sessionId }])];
        const redo = cmd.redoTarget(log);
        expect(redo).not.toBeNull();
        log = [...log, ...seal([{ type: 'event-undone', targetEventId: redo!, sessionId: before.sessionId }])];
        expect(replay(log)).toEqual(before);
      }),
      { numRuns: 60 },
    );
  });
});
