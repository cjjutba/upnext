import Dexie from 'dexie';
import { db as defaultDb, UpnextDB } from './db';
import { newId, getDeviceId } from '../lib/ids';
import type { Player, SessionEvent } from '../domain/types';
import { replay } from '../domain/reducer';

/** Omit that distributes over a union, so each SessionEvent variant keeps its own payload fields. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Everything the caller provides; the store fills the envelope. */
export type EventInput = DistributiveOmit<SessionEvent, 'id' | 'deviceId' | 'seq' | 'ts' | 'v'>;

export async function append(input: EventInput, db: UpnextDB = defaultDb, ts?: number): Promise<SessionEvent> {
  return db.transaction('rw', db.sessionEvents, db.meta, async () => {
    const row = await db.meta.get('seq');
    const seq = (typeof row?.value === 'number' ? row.value : 0) + 1;
    await db.meta.put({ key: 'seq', value: seq });
    const event = {
      ...input,
      id: newId(),
      deviceId: getDeviceId(),
      seq,
      ts: ts ?? Date.now(),
      v: 1,
    } as SessionEvent;
    await db.sessionEvents.add(event);
    return event;
  });
}

/** Canonical replay order: ULID id ascending. */
export async function loadSession(sessionId: string, db: UpnextDB = defaultDb): Promise<SessionEvent[]> {
  const events = await db.sessionEvents.where('sessionId').equals(sessionId).toArray();
  return events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface SessionListing {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
}

/** Uses the [type+sessionId] index; there is no sessions table by design. */
export async function listSessions(db: UpnextDB = defaultDb): Promise<SessionListing[]> {
  const starts = await db.sessionEvents
    .where('[type+sessionId]')
    .between(['session-started', Dexie.minKey], ['session-started', Dexie.maxKey])
    .toArray();
  const ends = await db.sessionEvents
    .where('[type+sessionId]')
    .between(['session-ended', Dexie.minKey], ['session-ended', Dexie.maxKey])
    .toArray();
  const endBy = new Map(ends.map((e) => [e.sessionId, e.ts]));
  return starts
    .sort((a, b) => b.ts - a.ts)
    .map((s) => ({ sessionId: s.sessionId, startedAt: s.ts, endedAt: endBy.get(s.sessionId) ?? null }));
}

/** Player ids who checked in to the most recent ended session. Powers the returning players shortcut. */
export async function lastSessionAttendees(db: UpnextDB = defaultDb): Promise<string[]> {
  const last = (await listSessions(db)).find((s) => s.endedAt !== null);
  if (!last) return [];
  return replay(await loadSession(last.sessionId, db)).checkedIn;
}

/**
 * startedAt of the newest ended session each player attended, over the last few
 * nights. Orders the check-in grid so the regulars sit at the top. Capped so a
 * long history never means replaying every log ever written.
 */
export async function attendanceRecency(db: UpnextDB = defaultDb, nights = 5): Promise<Record<string, number>> {
  const recent = (await listSessions(db)).filter((s) => s.endedAt !== null).slice(0, nights);
  const out: Record<string, number> = {};
  for (const s of recent) {
    for (const id of replay(await loadSession(s.sessionId, db)).checkedIn) {
      out[id] = out[id] ?? s.startedAt; // listSessions is newest first
    }
  }
  return out;
}

export interface SessionExport {
  format: 'upnext-session';
  v: 1;
  events: SessionEvent[];
  players: Player[];
}

/** Includes the whole roster on purpose: device handoff doubles as roster sync (merge is by UUID, last write wins). */
export async function exportSession(sessionId: string, db: UpnextDB = defaultDb): Promise<SessionExport> {
  return {
    format: 'upnext-session',
    v: 1,
    events: await loadSession(sessionId, db),
    players: await db.players.toArray(),
  };
}

/** Events union by id (idempotent); players merge by UUID, last write wins on updatedAt. */
export async function importSession(data: SessionExport, db: UpnextDB = defaultDb): Promise<void> {
  if (data.format !== 'upnext-session') throw new Error('Not an upnext session file');
  await db.transaction('rw', db.sessionEvents, db.players, async () => {
    await db.sessionEvents.bulkPut(data.events);
    for (const incoming of data.players) {
      const existing = await db.players.get(incoming.id);
      if (!existing || incoming.updatedAt >= existing.updatedAt) {
        await db.players.put(incoming);
      }
    }
  });
}
