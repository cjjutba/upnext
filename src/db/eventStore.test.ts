import { describe, it, expect, beforeEach } from 'vitest';
import { UpnextDB } from './db';
import {
  append,
  loadSession,
  listSessions,
  exportSession,
  importSession,
  lastSessionAttendees,
  attendanceRecency,
  type SessionExport,
} from './eventStore';

let db: UpnextDB;
let n = 0;

beforeEach(() => {
  n += 1;
  db = new UpnextDB(`upnext-test-${n}`);
});

const SID = 'session-1';

describe('append', () => {
  it('assigns envelope fields with increasing seq and sortable ids', async () => {
    const a = await append({ type: 'session-started', sessionId: SID, courts: 2, template: 'all-off', config: { winCap: 3 } }, db);
    const b = await append({ type: 'session-ended', sessionId: SID }, db);
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(a.id < b.id).toBe(true);
    expect(a.v).toBe(1);
    expect(a.deviceId).toBe(b.deviceId);
  });
});

describe('loadSession', () => {
  it('returns events in canonical order, id ascending', async () => {
    await append({ type: 'session-started', sessionId: SID, courts: 2, template: 'all-off', config: { winCap: 3 } }, db);
    await append({ type: 'player-checked-in', sessionId: SID, playerId: 'p1' }, db);
    await append({ type: 'player-checked-in', sessionId: 'other', playerId: 'p2' }, db);
    const events = await loadSession(SID, db);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual(['session-started', 'player-checked-in']);
  });
});

describe('listSessions', () => {
  it('lists newest first and marks in-progress sessions', async () => {
    await append({ type: 'session-started', sessionId: 'old', courts: 2, template: 'all-off', config: { winCap: 3 } }, db, 1000);
    await append({ type: 'session-ended', sessionId: 'old' }, db, 2000);
    await append({ type: 'session-started', sessionId: 'live', courts: 2, template: 'all-off', config: { winCap: 3 } }, db, 3000);
    const list = await listSessions(db);
    expect(list.map((s) => s.sessionId)).toEqual(['live', 'old']);
    expect(list[0].endedAt).toBeNull();
    expect(list[1].endedAt).toBe(2000);
  });
});

describe('export and import', () => {
  it('round trips and is idempotent by event id', async () => {
    await db.players.put({ id: 'p1', name: 'Priya', createdAt: 1, updatedAt: 1 });
    await append({ type: 'session-started', sessionId: SID, courts: 2, template: 'all-off', config: { winCap: 3 } }, db);
    const dump = await exportSession(SID, db);
    expect(dump.format).toBe('upnext-session');
    expect(dump.events).toHaveLength(1);

    const db2 = new UpnextDB(`upnext-test-import-${n}`);
    await importSession(dump, db2);
    await importSession(dump, db2); // importing twice must not duplicate
    expect(await db2.sessionEvents.count()).toBe(1);
    expect((await db2.players.get('p1'))?.name).toBe('Priya');
  });

  it('merges players by id with last write wins on updatedAt', async () => {
    await db.players.put({ id: 'p1', name: 'Old Name', createdAt: 1, updatedAt: 5 });
    const dump: SessionExport = {
      format: 'upnext-session',
      v: 1,
      events: [],
      players: [{ id: 'p1', name: 'New Name', createdAt: 1, updatedAt: 9 }],
    };
    await importSession(dump, db);
    expect((await db.players.get('p1'))?.name).toBe('New Name');
    const older: SessionExport = { ...dump, players: [{ id: 'p1', name: 'Stale', createdAt: 1, updatedAt: 2 }] };
    await importSession(older, db);
    expect((await db.players.get('p1'))?.name).toBe('New Name');
  });
});

describe('lastSessionAttendees', () => {
  it('returns the checked-in player ids of the newest ended session', async () => {
    await append({ type: 'session-started', sessionId: 'old', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 1000);
    await append({ type: 'player-checked-in', sessionId: 'old', playerId: 'p1' }, db, 1001);
    await append({ type: 'session-ended', sessionId: 'old' }, db, 1002);
    await append({ type: 'session-started', sessionId: 'new', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 2000);
    await append({ type: 'player-checked-in', sessionId: 'new', playerId: 'p2' }, db, 2001);
    await append({ type: 'player-checked-in', sessionId: 'new', playerId: 'p3' }, db, 2002);
    await append({ type: 'session-ended', sessionId: 'new' }, db, 2003);
    await append({ type: 'session-started', sessionId: 'live', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 3000);
    expect(await lastSessionAttendees(db)).toEqual(['p2', 'p3']);
  });

  it('returns empty with no ended sessions', async () => {
    expect(await lastSessionAttendees(db)).toEqual([]);
  });
});

describe('attendanceRecency', () => {
  it('maps each player to the start of the newest ended session they attended', async () => {
    await append({ type: 'session-started', sessionId: 'a', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 1000);
    await append({ type: 'player-checked-in', sessionId: 'a', playerId: 'p1' }, db, 1100);
    await append({ type: 'player-checked-in', sessionId: 'a', playerId: 'p2' }, db, 1200);
    await append({ type: 'session-ended', sessionId: 'a' }, db, 2000);
    await append({ type: 'session-started', sessionId: 'b', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 3000);
    await append({ type: 'player-checked-in', sessionId: 'b', playerId: 'p2' }, db, 3100);
    await append({ type: 'session-ended', sessionId: 'b' }, db, 4000);
    // a live night is not history yet
    await append({ type: 'session-started', sessionId: 'c', courts: 1, template: 'all-off', config: { winCap: 3 } }, db, 5000);
    await append({ type: 'player-checked-in', sessionId: 'c', playerId: 'p9' }, db, 5100);

    expect(await attendanceRecency(db)).toEqual({ p1: 1000, p2: 3000 });
  });
});
