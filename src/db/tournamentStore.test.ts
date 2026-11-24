import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { UpnextDB } from './db';
import { append, exportSession } from './eventStore';
import {
  createTournament, dispatchTournament, exportTournament, importTournament, listTournaments, loadTournament,
} from './tournamentStore';
import { defaultDivisionRules, defaultTournamentSettings } from '../domain/tournament';
import type { TournamentAction } from '../domain/tournament';

let nextDatabase = 0;
const created: UpnextDB[] = [];
function database(name = 'tournament-test-' + ++nextDatabase) {
  const db = new UpnextDB(name);
  created.push(db);
  return db;
}

afterEach(async () => {
  for (const db of created) db.close();
  await Promise.all([...new Set(created.splice(0).map(db => db.name))].map(name => Dexie.delete(name)));
});

async function example(db: UpnextDB) {
  const tournamentId = 'fixture';
  await createTournament(defaultTournamentSettings(), { tournamentId }, db);
  const run = (action: TournamentAction, requestId?: string) => dispatchTournament(tournamentId, action, { requestId }, db);
  for (let i = 1; i <= 4; i++) {
    await db.players.add({ id: 'p' + i, name: 'Player ' + i, createdAt: 1, updatedAt: 1 });
    await run({ type: 'set-entry', divisionId: 'unidos', playerId: 'p' + i, clubMember: true });
  }
  await run({ type: 'lock-division', divisionId: 'unidos' });
  return { tournamentId, run };
}

describe('tournament storage', () => {
  it('preserves v1 IndexedDB rows and the casual export during upgrade', async () => {
    const db = database();
    const legacy = new Dexie(db.name);
    legacy.version(1).stores({
      players: 'id, name, createdAt',
      sessionEvents: 'id, sessionId, type, [type+sessionId], [sessionId+seq]',
      meta: 'key',
    });
    const player = { id: 'legacy', name: 'Legacy Player', createdAt: 1, updatedAt: 2, rating: 2 };
    const casualStart = {
      id: 'first', sessionId: 'casual', deviceId: 'legacy', seq: 7, ts: 1, v: 1,
      type: 'session-started', courts: 1, template: 'all-off', config: { winCap: 3 },
    };
    await legacy.table('players').add(player);
    await legacy.table('sessionEvents').add(casualStart);
    await legacy.table('meta').add({ key: 'seq', value: 7 });
    legacy.close();

    await createTournament(defaultTournamentSettings(), { tournamentId: 'separate' }, db);
    expect(await exportSession('casual', db)).toEqual({ format: 'upnext-session', v: 1, events: [casualStart], players: [player] });
    const next = await append({ type: 'session-ended', sessionId: 'casual' }, db);
    expect(next.seq).toBe(8);
    expect(await listTournaments(db)).toMatchObject([{ id: 'separate', name: 'Unidos and Plaridel Open' }]);
  });

  it('serializes repeated previews and confirmation across connections and reloads the exact draw', async () => {
    const db = database();
    const { tournamentId, run } = await example(db);
    const second = database(db.name);
    const preview = { type: 'preview-draw', divisionId: 'unidos' } as const;
    const [a, b] = await Promise.all([
      run(preview, 'preview'),
      dispatchTournament(tournamentId, preview, { requestId: 'preview' }, second),
    ]);
    expect(a.divisions.unidos.draw).toEqual(b.divisions.unidos.draw);
    expect(a.revision).toBe(b.revision);
    db.close();
    const reopened = database(db.name);
    expect((await loadTournament(tournamentId, reopened))?.divisions.unidos.draw).toEqual(a.divisions.unidos.draw);
    const confirm = { type: 'confirm-draw', divisionId: 'unidos', drawId: a.divisions.unidos.draw!.id } as const;
    const outcomes = await Promise.allSettled([
      dispatchTournament(tournamentId, confirm, { requestId: 'confirm-a' }, second),
      dispatchTournament(tournamentId, confirm, { requestId: 'confirm-b' }, reopened),
    ]);
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await loadTournament(tournamentId, reopened))?.divisions.unidos.confirmedDraws).toHaveLength(1);
  });

  it('enforces roster membership and prevents concurrent bookings on different courts', async () => {
    const db = database();
    const settings = { ...defaultTournamentSettings(), courts: [{ id: '1', name: 'Court 1' }, { id: '2', name: 'Court 2' }] };
    const { id } = await createTournament(settings, { requestId: 'create' }, db);
    const run = (action: TournamentAction, expectedRevision?: number) => dispatchTournament(id, action, { expectedRevision }, db);
    await expect(run({ type: 'set-entry', divisionId: 'unidos', playerId: 'unknown', clubMember: true })).rejects.toThrow(/roster/);
    for (const playerId of ['overlap', 'one', 'two', 'three', 'four', 'five', 'six']) {
      await db.players.add({ id: playerId, name: playerId, createdAt: 1, updatedAt: 1 });
    }
    for (const [divisionId, players] of [['women', ['one', 'two', 'three']], ['mixed', ['four', 'five', 'six']]] as const) {
      await run({ type: 'set-team', divisionId, team: { id: 'a', name: 'A', playerIds: ['overlap', players[0]] } });
      await run({ type: 'set-team', divisionId, team: { id: 'b', name: 'B', playerIds: [players[1], players[2]] } });
      await run({ type: 'lock-division', divisionId });
    }
    const state = (await loadTournament(id, db))!;
    const second = database(db.name);
    const outcomes = await Promise.allSettled([
      run({ type: 'assign-court', divisionId: 'women', matchId: state.divisions.women.matches[0].id, courtId: '1' }),
      dispatchTournament(id, { type: 'assign-court', divisionId: 'mixed', matchId: state.divisions.mixed.matches[0].id, courtId: '2' }, {}, second),
    ]);
    expect(outcomes.map(outcome => outcome.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { code: 'court-conflict' } });
    await expect(run({ type: 'update-settings', settings }, state.revision)).rejects.toMatchObject({ code: 'stale-revision' });
    expect((await loadTournament(id, db))?.revision).toBe(state.revision + 1);
  });

  it('round trips draws and corrected results, imports only a missing suffix and preserves local roster rows', async () => {
    const db = database();
    const { tournamentId, run } = await example(db);
    const { draw } = (await run({ type: 'preview-draw', divisionId: 'unidos' })).divisions.unidos;
    const old = await exportTournament(tournamentId, db);
    const { matches } = (await run({ type: 'confirm-draw', divisionId: 'unidos', drawId: draw!.id })).divisions.unidos;
    const matchId = matches[0].id;
    await run({ type: 'assign-court', divisionId: 'unidos', matchId, courtId: '1' });
    await run({ type: 'start-match', divisionId: 'unidos', matchId });
    const recorded = await run({ type: 'record-result', divisionId: 'unidos', matchId, result: { type: 'played', games: [[11, 3]] } });
    const correction = await run({
      type: 'correct-result', divisionId: 'unidos', matchId, expectedResultId: recorded.divisions.unidos.matches[0].resultEventId!,
      result: { type: 'played', games: [[9, 11]] }, reason: 'Corrected the transcribed score',
    });
    const backup = await exportTournament(tournamentId, db);
    expect(backup.exportedAt).toBeTypeOf('number');
    expect(backup.players.map(player => player.name)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
    const restored = database();
    const localPlayer = { id: 'p1', name: 'Local Name', createdAt: 1, updatedAt: 2, rating: 5 };
    await restored.players.add(localPlayer);
    expect((await importTournament(JSON.parse(JSON.stringify(old)), restored)).divisions.unidos.draw).toEqual(draw);
    expect(await importTournament(JSON.parse(JSON.stringify(backup)), restored)).toEqual(correction);
    await importTournament({ ...backup, exportedAt: undefined }, restored);
    expect(await importTournament(old, restored)).toEqual(correction);
    expect(await restored.tournamentEvents.count()).toBe(backup.events.length);
    expect(await restored.players.get('p1')).toEqual(localPlayer);
    expect((await loadTournament(tournamentId, restored))?.divisions.unidos.matches[0].result).toEqual({ type: 'played', games: [[9, 11]] });
  });

  it('refuses broken and divergent backups without changing either table', async () => {
    const source = database();
    const { tournamentId, run } = await example(source);
    const empty = database();
    const { draw } = (await run({ type: 'preview-draw', divisionId: 'unidos' })).divisions.unidos;
    await run({ type: 'confirm-draw', divisionId: 'unidos', drawId: draw!.id });
    const backup = await exportTournament(tournamentId, source);
    const bad = structuredClone(backup);
    bad.events.at(-1)!.fixtures![0].courtId = 'spoofed';
    for (const invalid of [
      { ...backup, v: 2 },
      { ...backup, events: [...backup.events, backup.events[0]] },
      { ...backup, players: [] },
      bad,
    ]) {
      await expect(importTournament(invalid, empty)).rejects.toThrow();
      expect(await empty.tournamentEvents.count()).toBe(0);
      expect(await empty.players.count()).toBe(0);
    }
    const divergent = database();
    await createTournament({ ...defaultTournamentSettings(), name: 'Different tournament' }, { tournamentId }, divergent);
    await expect(importTournament(backup, divergent)).rejects.toMatchObject({ code: 'backup-conflict' });
    expect(await divergent.tournamentEvents.count()).toBe(1);
    expect(await divergent.players.count()).toBe(0);
  });

  it('refuses an invalid score and keeps a scored best of three across reload', async () => {
    const db = database();
    const { tournamentId, run } = await example(db);
    await run({ type: 'configure-division', divisionId: 'mixed', rules: {
      ...defaultDivisionRules('mixed'), score: { ...defaultDivisionRules('mixed').score, gamesToWin: 2 },
    } });
    await run({ type: 'set-team', divisionId: 'mixed', team: { id: 'left', name: 'Left', playerIds: ['p1', 'p2'] } });
    await run({ type: 'set-team', divisionId: 'mixed', team: { id: 'right', name: 'Right', playerIds: ['p3', 'p4'] } });
    const { matches } = (await run({ type: 'lock-division', divisionId: 'mixed' })).divisions.mixed;
    const matchId = matches[0].id;
    await run({ type: 'assign-court', divisionId: 'mixed', matchId, courtId: '1' });
    const live = await run({ type: 'start-match', divisionId: 'mixed', matchId });
    await expect(run({ type: 'record-result', divisionId: 'mixed', matchId, result: { type: 'played', games: [[11, 3]] } }))
      .rejects.toThrow(/completed game scores/);
    expect((await loadTournament(tournamentId, db))?.revision).toBe(live.revision);
    const games: [number, number][] = [[11, 3], [9, 11], [12, 10]];
    await run({ type: 'record-result', divisionId: 'mixed', matchId, result: { type: 'played', games } });
    expect((await loadTournament(tournamentId, db))?.divisions.mixed.matches[0].result).toEqual({ type: 'played', games });
  });
});
