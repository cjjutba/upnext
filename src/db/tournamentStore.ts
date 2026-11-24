import { db as defaultDb } from './db';
import type { UpnextDB } from './db';
import type { Player } from '../domain/types';
import {
  advanceTournament, defaultTournamentSettings, prepareTournamentEvent, replayTournament,
  TournamentCommandError, validateTournamentEvent,
} from '../domain/tournament';
import type { TournamentAction, TournamentEvent, TournamentSettings, TournamentState } from '../domain/tournament';
import { requireTournament } from '../domain/tournament/errors';
import { filled, integer, record, sameData } from '../domain/tournament/validation';

export interface TournamentListing {
  id: string;
  name: string;
  date: string;
  createdAt: number;
  updatedAt: number;
}

export interface TournamentBackup {
  format: 'upnext-tournament';
  v: 1;
  tournamentId: string;
  exportedAt?: number;
  events: TournamentEvent[];
  players: Player[];
}

interface DispatchOptions {
  requestId?: string;
  expectedRevision?: number;
}

interface CreateOptions {
  tournamentId?: string;
  requestId?: string;
}

export { TournamentCommandError } from '../domain/tournament';

function referencedPlayers(action: TournamentAction): string[] {
  if (action.type === 'set-entry') return [action.playerId];
  if (action.type === 'set-team') return action.team.playerIds;
  return [];
}

function loadEvents(id: string, db: UpnextDB): Promise<TournamentEvent[]> {
  return db.tournamentEvents.where('tournamentId').equals(id).sortBy('seq');
}

export async function createTournament(
  settings: TournamentSettings = defaultTournamentSettings(), options: CreateOptions = {}, db: UpnextDB = defaultDb,
): Promise<TournamentState> {
  const id = options.tournamentId ?? options.requestId ?? crypto.randomUUID();
  return dispatchTournament(id, { type: 'create', settings }, { requestId: options.requestId ?? id }, db);
}

export async function loadTournament(id: string, db: UpnextDB = defaultDb): Promise<TournamentState | null> {
  return replayTournament(await loadEvents(id, db));
}

export async function listTournaments(db: UpnextDB = defaultDb): Promise<TournamentListing[]> {
  const listings = new Map<string, TournamentListing>();
  await db.tournamentEvents.orderBy('[tournamentId+seq]').each(event => {
    if (event.action.type === 'create') {
      const { name, date } = event.action.settings;
      listings.set(event.tournamentId, { id: event.tournamentId, name, date, createdAt: event.ts, updatedAt: event.ts });
      return;
    }
    const listing = listings.get(event.tournamentId);
    if (!listing) return;
    listing.updatedAt = event.ts;
    if (event.action.type === 'update-settings') {
      listing.name = event.action.settings.name;
      listing.date = event.action.settings.date;
    }
  });
  return [...listings.values()].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

export async function dispatchTournament(
  id: string, action: TournamentAction, options: DispatchOptions = {}, db: UpnextDB = defaultDb,
): Promise<TournamentState> {
  const requestId = options.requestId ?? crypto.randomUUID();
  requireTournament(filled(id) && filled(requestId), 'A tournament and request ID are required.');
  const input = structuredClone(action);
  const { expectedRevision } = options;
  return db.transaction('rw', db.tournamentEvents, db.players, async () => {
    const events = await loadEvents(id, db);
    const state = replayTournament(events);
    const existing = events.find(event => event.id === requestId);
    if (existing) {
      requireTournament(state && sameData(existing.action, input), 'This request ID was already used for a different action.');
      return state;
    }
    if (expectedRevision !== undefined && expectedRevision !== (state?.revision ?? 0)) {
      throw new TournamentCommandError('The tournament changed. Reload it before retrying.', 'stale-revision');
    }
    const event = prepareTournamentEvent(state, input, {
      tournamentId: id, id: requestId, seq: (state?.revision ?? 0) + 1, ts: Date.now(),
    }, Math.random);
    const players = referencedPlayers(input);
    if (players.length) {
      requireTournament((await db.players.bulkGet(players)).every(playerRecord), 'Choose player identities from the roster.');
    }
    const next = advanceTournament(state, event);
    await db.tournamentEvents.add(event);
    return next;
  });
}

function allReferencedPlayers(events: TournamentEvent[]): string[] {
  return [...new Set(events.flatMap(event => referencedPlayers(event.action)))];
}

export async function exportTournament(id: string, db: UpnextDB = defaultDb): Promise<TournamentBackup> {
  return db.transaction('r', db.tournamentEvents, db.players, async () => {
    const events = await loadEvents(id, db);
    requireTournament(events.length > 0, 'Tournament not found.');
    const players = await db.players.bulkGet(allReferencedPlayers(events));
    requireTournament(players.every(player => player !== undefined), 'The tournament references a roster identity that is missing.');
    return { format: 'upnext-tournament', v: 1, tournamentId: id, exportedAt: Date.now(), events, players };
  });
}

function playerRecord(value: unknown): value is Player {
  return record(value) && filled(value.id) && filled(value.name)
    && integer(value.createdAt) && integer(value.updatedAt)
    && (value.level === undefined || typeof value.level === 'string')
    && (value.rating === undefined || (integer(value.rating, 1) && value.rating <= 5));
}

function validateBackup(data: unknown): { backup: TournamentBackup; state: TournamentState } {
  requireTournament(record(data) && data.format === 'upnext-tournament' && data.v === 1
    && filled(data.tournamentId) && (data.exportedAt === undefined || integer(data.exportedAt)) && Array.isArray(data.events) && data.events.length > 0
    && Array.isArray(data.players) && data.players.every(playerRecord), 'Choose a version 1 Upnext tournament backup.');
  const ids = new Set<string>();
  let state: TournamentState | null = null;
  for (const [index, event] of data.events.entries()) {
    requireTournament(record(event) && filled(event.id) && !ids.has(event.id)
      && event.tournamentId === data.tournamentId && event.seq === index + 1, 'The tournament backup event sequence is invalid.');
    ids.add(event.id);
    state = validateTournamentEvent(state, event as unknown as TournamentEvent);
  }
  requireTournament(state, 'The tournament backup has no tournament.');
  const backup = data as unknown as TournamentBackup;
  const roster = new Set(backup.players.map(player => player.id));
  const referenced = allReferencedPlayers(backup.events);
  requireTournament(roster.size === backup.players.length && roster.size === referenced.length
    && referenced.every(id => roster.has(id)), 'The backup needs one roster record per referenced player.');
  return { backup, state };
}

export async function importTournament(data: unknown, db: UpnextDB = defaultDb): Promise<TournamentState> {
  const { backup, state } = validateBackup(structuredClone(data));
  return db.transaction('rw', db.tournamentEvents, db.players, async () => {
    const local = await loadEvents(backup.tournamentId, db);
    const shared = Math.min(local.length, backup.events.length);
    for (let index = 0; index < shared; index++) {
      if (!sameData(local[index], backup.events[index])) {
        throw new TournamentCommandError(
          'This backup and the saved tournament have different activity. Open the backup on a separate device to compare.',
          'backup-conflict',
        );
      }
    }
    const additions = backup.events.slice(local.length);
    if (additions.length) await db.tournamentEvents.bulkAdd(additions);
    const existing = await db.players.bulkGet(backup.players.map(player => player.id));
    const missing = backup.players.filter((_, index) => !existing[index]);
    if (missing.length) await db.players.bulkAdd(missing);
    return local.length > backup.events.length ? replayTournament(local)! : state;
  });
}
