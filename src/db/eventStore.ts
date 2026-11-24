import { db as defaultDb, type UpnextDB } from './db';
import { newId, getDeviceId } from '../lib/ids';
import type { Player, SessionEvent } from '../domain/types';
import { computeSkipped, replay } from '../domain/reducer';

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

const byEventId = (a: SessionEvent, b: SessionEvent) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Canonical replay order: ULID id ascending. */
export async function loadSession(sessionId: string, db: UpnextDB = defaultDb): Promise<SessionEvent[]> {
  const events = await db.sessionEvents.where('sessionId').equals(sessionId).toArray();
  return events.sort(byEventId);
}

export interface SessionListing {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
}

function sessionLifecycle(events: SessionEvent[]) {
  const skipped = computeSkipped(events);
  const start = events.find((e) => e.type === 'session-started' && !skipped.has(e.id));
  const ends = start
    ? events.filter((e) => e.type === 'session-ended' && e.id > start.id && !skipped.has(e.id))
    : [];
  return { start, ends };
}

/** Read lifecycle events and their undo chains without loading historic gameplay. */
export async function listSessions(db: UpnextDB = defaultDb): Promise<SessionListing[]> {
  const events = await db.sessionEvents
    .where('type')
    .anyOf('session-started', 'session-ended', 'event-undone')
    .toArray();
  const logs = new Map<string, SessionEvent[]>();
  for (const event of events) {
    const log = logs.get(event.sessionId);
    if (log) log.push(event);
    else logs.set(event.sessionId, [event]);
  }
  const sessions: SessionListing[] = [];
  for (const log of logs.values()) {
    const { start, ends } = sessionLifecycle(log.sort(byEventId));
    if (start) sessions.push({ sessionId: start.sessionId, startedAt: start.ts, endedAt: ends[0]?.ts ?? null });
  }
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

/** Recheck the saved log inside the write transaction so a stale Reopen is harmless. */
export async function reopenSession(sessionId: string, db: UpnextDB = defaultDb): Promise<SessionEvent[]> {
  return db.transaction('rw', db.sessionEvents, db.meta, async () => {
    const events = await loadSession(sessionId, db);
    const { ends } = sessionLifecycle(events);
    // Undo repeated ends too, so a duplicate end cannot take effect as soon as the first is undone.
    for (const end of ends) {
      events.push(await append({ type: 'event-undone', targetEventId: end.id, sessionId }, db));
    }
    return events.sort(byEventId);
  });
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
