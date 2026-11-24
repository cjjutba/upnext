import { describe, expect, it } from 'vitest';
import {
  defaultDivisionRules, defaultTournamentSettings, getDivisionStandings, getRotationProgress,
  prepareTournamentEvent, replayTournament, validateScores,
} from './index';
import type { TournamentAction, TournamentEvent, TournamentState } from './index';

function organizer() {
  const events: TournamentEvent[] = [];
  let state: TournamentState | null = null;
  return {
    get state() { return state!; },
    get events() { return events; },
    act(action: TournamentAction) {
      const seq = events.length + 1;
      const event = prepareTournamentEvent(state, action, { tournamentId: 't', id: String(seq), seq, ts: seq }, () => .37);
      events.push(event);
      state = replayTournament(events);
      return state!;
    },
  };
}

describe('tournament rules', () => {
  it('validates actual game endpoints and a best of three', () => {
    const score = { ...defaultDivisionRules('mixed').score, gamesToWin: 2 };
    expect(validateScores([[11, 3], [9, 11], [12, 10]], score)).toBe(0);
    expect(validateScores([[11, 3], [11, 9], [11, 8]], score)).toBeNull();
    expect(validateScores([[12, 3], [11, 4]], score)).toBeNull();
  });

  it('replays the draw and reaches six scored games each for 100 eligible players', () => {
    const tournament = organizer();
    tournament.act({ type: 'create', settings: defaultTournamentSettings() });
    for (let i = 1; i <= 100; i++) tournament.act({ type: 'set-entry', divisionId: 'unidos', playerId: 'p' + i, clubMember: true });
    tournament.act({ type: 'set-entry', divisionId: 'unidos', playerId: 'ineligible', clubMember: false });
    tournament.act({ type: 'lock-division', divisionId: 'unidos' });
    expect(getRotationProgress(tournament.state).remainingGames).toBe(150);
    for (let i = 0; i < 150; i++) {
      const { draw } = tournament.act({ type: 'preview-draw', divisionId: 'unidos' }).divisions.unidos;
      expect(replayTournament(tournament.events)?.divisions.unidos.draw).toEqual(draw);
      const { matches } = tournament.act({ type: 'confirm-draw', divisionId: 'unidos', drawId: draw!.id }).divisions.unidos;
      const matchId = matches.at(-1)!.id;
      tournament.act({ type: 'assign-court', divisionId: 'unidos', matchId, courtId: '1' });
      tournament.act({ type: 'start-match', divisionId: 'unidos', matchId });
      tournament.act({ type: 'record-result', divisionId: 'unidos', matchId, result: { type: 'played', games: [i % 2 ? [9, 11] : [11, 3]] } });
    }
    const ranking = getDivisionStandings(tournament.state, 'unidos');
    const rows = ranking.groups[0].rows;
    expect(rows).toHaveLength(100);
    expect(rows.every(row => row.played === 6)).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.wins, 0)).toBe(300);
    expect(rows.reduce((sum, row) => sum + row.pointDifferential, 0)).toBe(0);
    expect(ranking.provisional).toBe(false);
    expect(rows.some(row => row.evidence.some(item => item.metric === 'opponents-win-rate' && item.value !== null))).toBe(true);
    expect(tournament.state.divisions.unidos.confirmedDraws).toHaveLength(150);
  }, 30_000);
});

function createTournamentFixture() {
  const tournament = organizer();
  const settings = { ...defaultTournamentSettings(), courts: [{ id: '1', name: 'Court 1' }, { id: '2', name: 'Court 2' }] };
  tournament.act({ type: 'create', settings });
  return tournament;
}

type Organizer = ReturnType<typeof organizer>;

function register(tournament: Organizer, divisionId: 'women' | 'mixed' | 'men', teamCount: number) {
  for (let i = 1; i <= teamCount; i++) {
    tournament.act({ type: 'set-team', divisionId, team: {
      id: divisionId + i, name: 'Team ' + i, playerIds: ['player' + i, divisionId + '-partner' + i],
    } });
  }
}

function play(
  tournament: Organizer, divisionId: 'unidos' | 'women' | 'mixed' | 'men', matchId: string,
  games: [number, number][] = [[11, 3]],
) {
  tournament.act({ type: 'assign-court', divisionId, matchId, courtId: '1' });
  tournament.act({ type: 'start-match', divisionId, matchId });
  tournament.act({ type: 'record-result', divisionId, matchId, result: { type: 'played', games } });
}

function fillUnidos(tournament: Organizer, count: number) {
  for (let i = 1; i <= count; i++) tournament.act({ type: 'set-entry', divisionId: 'unidos', playerId: 'p' + i, clubMember: true });
}

function previewAndConfirm(tournament: Organizer) {
  const { draw } = tournament.act({ type: 'preview-draw', divisionId: 'unidos' }).divisions.unidos;
  return tournament.act({ type: 'confirm-draw', divisionId: 'unidos', drawId: draw!.id }).divisions.unidos;
}

function pools() {
  const tournament = createTournamentFixture();
  tournament.act({ type: 'configure-division', divisionId: 'women', rules: {
    ...defaultDivisionRules('women'), competition: { type: 'pools', poolSizes: [4, 4], advancePerPool: 2 },
  } });
  register(tournament, 'women', 8);
  tournament.act({ type: 'lock-division', divisionId: 'women' });
  const matches = tournament.state.divisions.women.matches.filter(match => match.phase === 'pool');
  for (const match of matches) {
    const lowerSeedWins = match.teamIds![0] > match.teamIds![1];
    play(tournament, 'women', match.id, lowerSeedWins ? [[3, 11]] : [[11, 3]]);
  }
  return tournament;
}

function changePoolWinner(tournament: Organizer) {
  const match = tournament.state.divisions.women.matches.find(row =>
    row.pool === 'A' && row.teamIds?.includes('women2') && row.teamIds.includes('women3'))!;
  return {
    type: 'correct-result' as const,
    divisionId: 'women' as const,
    matchId: match.id,
    result: { type: 'played' as const, games: [match.teamIds![0] === 'women3' ? [11, 3] : [3, 11]] as [number, number][] },
    expectedResultId: match.resultEventId!,
    reason: 'Checked the score sheet',
  };
}

describe('fixtures, scheduling and corrections', () => {
  it('locks the saved blind pair draw, skips ineligible players and generates a three-team round robin', () => {
    const tournament = createTournamentFixture();
    tournament.act({ type: 'configure-division', divisionId: 'unidos', rules: {
      ...defaultDivisionRules('unidos'), mode: 'blind-teams',
    } });
    fillUnidos(tournament, 5);
    expect(() => tournament.act({ type: 'preview-draw', divisionId: 'unidos' })).toThrow(/even number/);
    fillUnidos(tournament, 6);
    tournament.act({ type: 'set-entry', divisionId: 'unidos', playerId: 'visitor', clubMember: false });
    const { draw } = tournament.act({ type: 'preview-draw', divisionId: 'unidos' }).divisions.unidos;
    expect(draw!.pairs.flat()).not.toContain('visitor');
    expect(() => tournament.act({ type: 'preview-draw', divisionId: 'unidos' })).toThrow(/existing draw/);
    expect(() => tournament.act({ type: 'remove-entry', divisionId: 'unidos', playerId: 'p1' })).toThrow(/locks/);
    expect(() => tournament.act({ type: 'discard-draw', divisionId: 'unidos', drawId: 'stale' })).toThrow(/currently saved/);
    tournament.act({ type: 'discard-draw', divisionId: 'unidos', drawId: draw!.id });
    tournament.act({ type: 'set-entry', divisionId: 'unidos', playerId: 'visitor', clubMember: false });
    const replacement = tournament.act({ type: 'preview-draw', divisionId: 'unidos' }).divisions.unidos.draw!;
    expect(replacement.id).not.toBe(draw!.id);
    const settled = tournament.act({ type: 'confirm-draw', divisionId: 'unidos', drawId: replacement.id }).divisions.unidos;
    expect(settled.locked).toBe(true);
    expect(settled.teams.map(team => team.playerIds)).toEqual(replacement.pairs);
    expect(settled.confirmedDraws).toEqual([replacement]);
    expect(settled.matches).toHaveLength(3);
    for (const team of settled.teams) expect(settled.matches.filter(match => match.teamIds?.includes(team.id))).toHaveLength(2);
    expect(replayTournament(tournament.events)?.divisions.unidos).toEqual(settled);
  });

  it('requires manual start and protects courts and shared player identities across divisions', () => {
    const tournament = createTournamentFixture();
    for (const divisionId of ['women', 'mixed'] as const) {
      register(tournament, divisionId, 2);
      tournament.act({ type: 'lock-division', divisionId });
    }
    const [women] = tournament.state.divisions.women.matches;
    const [mixed] = tournament.state.divisions.mixed.matches;
    tournament.act({ type: 'assign-court', divisionId: 'women', matchId: women.id, courtId: '1' });
    expect(() => tournament.act({ type: 'record-result', divisionId: 'women', matchId: women.id, result: { type: 'played', games: [[11, 3]] } }))
      .toThrow(/Start the match/);
    tournament.act({ type: 'start-match', divisionId: 'women', matchId: women.id });
    for (const courtId of ['1', '2']) {
      expect(() => tournament.act({ type: 'assign-court', divisionId: 'mixed', matchId: mixed.id, courtId }))
        .toThrow(expect.objectContaining({ code: 'court-conflict', matchIds: [women.id] }));
    }
    tournament.act({ type: 'record-result', divisionId: 'women', matchId: women.id, result: { type: 'played', games: [[11, 3]] } });
    tournament.act({ type: 'assign-court', divisionId: 'mixed', matchId: mixed.id, courtId: '1' });
    expect(tournament.state.divisions.mixed.matches[0].startedAt).toBeNull();
  });

  it('rebuilds unplayed crossed semifinal qualifiers and crowns the final winner', () => {
    const tournament = pools();
    const before = tournament.state.divisions.women.matches;
    expect(before.filter(match => match.phase === 'pool')).toHaveLength(12);
    for (const team of tournament.state.divisions.women.teams) {
      expect(before.filter(match => match.phase === 'pool' && match.teamIds!.includes(team.id))).toHaveLength(3);
    }
    const bracket = before.filter(match => match.phase === 'playoff');
    expect(bracket.map(match => match.teamIds)).toEqual([['women1', 'women6'], ['women5', 'women2'], null]);
    tournament.act({ type: 'assign-court', divisionId: 'women', matchId: bracket[1].id, courtId: '1' });
    const correction = changePoolWinner(tournament);
    tournament.act(correction);
    const updated = tournament.state.divisions.women.matches.filter(match => match.phase === 'playoff');
    expect(updated[1].teamIds).toEqual(['women5', 'women3']);
    expect(updated[1].courtId).toBeNull();
    expect(() => tournament.act(correction)).toThrow(expect.objectContaining({ code: 'stale-revision' }));
    play(tournament, 'women', updated[0].id);
    play(tournament, 'women', updated[1].id, [[9, 11]]);
    play(tournament, 'women', updated[2].id, [[9, 11]]);
    expect(getDivisionStandings(tournament.state, 'women')).toMatchObject({ provisional: false, championId: 'women3' });
  });

  it('requires a reasoned decision before changing a started qualifier and preserves the audit trail', () => {
    const tournament = pools();
    const [, semifinal] = tournament.state.divisions.women.matches.filter(match => match.phase === 'playoff');
    play(tournament, 'women', semifinal.id);
    const correction = changePoolWinner(tournament);
    const before = tournament.events.length;
    expect(() => tournament.act(correction)).toThrow(expect.objectContaining({ code: 'qualifier-conflict', matchIds: [semifinal.id] }));
    expect(tournament.events).toHaveLength(before);
    const corrected = tournament.act({ ...correction, resolution: { policy: 'reset-affected', reason: 'Replay the semifinal with the corrected qualifier' } });
    const reset = corrected.divisions.women.matches.find(match => match.id === semifinal.id)!;
    expect(reset).toMatchObject({ teamIds: ['women5', 'women3'], courtId: null, startedAt: null, result: null });
    expect(tournament.events.filter(event => event.action.type === 'record-result' && event.action.matchId === semifinal.id)).toHaveLength(1);
  });

  it('keeps a single seeded entry per bracket when the organizer retains started lineups', () => {
    const tournament = pools();
    const [semifinal, otherSemifinal] = tournament.state.divisions.women.matches.filter(match => match.phase === 'playoff');
    play(tournament, 'women', semifinal.id);
    const match = tournament.state.divisions.women.matches.find(row => row.pool === 'A'
      && row.teamIds?.includes('women1') && row.teamIds.includes('women2'))!;
    const state = tournament.act({
      type: 'correct-result', divisionId: 'women', matchId: match.id, expectedResultId: match.resultEventId!,
      result: { type: 'played', games: [match.teamIds![0] === 'women2' ? [11, 3] : [3, 11]] },
      reason: 'Corrected the winner',
      resolution: { policy: 'keep-started', reason: 'Retain the semifinal lineups already announced' },
    });
    const bracket = state.divisions.women.matches.filter(row => row.phase === 'playoff');
    expect(bracket[0]).toMatchObject({ teamIds: semifinal.teamIds, qualifierLocked: true });
    expect(bracket[1]).toMatchObject({ teamIds: otherSemifinal.teamIds, qualifierLocked: true });
  });

  it('records an explicit withdrawal and flags unfillable rotating slots', () => {
    const tournament = createTournamentFixture();
    fillUnidos(tournament, 5);
    tournament.act({ type: 'configure-division', divisionId: 'unidos', rules: {
      ...defaultDivisionRules('unidos'), gamesPerPlayer: 1, withdrawalPolicy: 'cancel',
    } });
    tournament.act({ type: 'lock-division', divisionId: 'unidos' });
    expect(getRotationProgress(tournament.state)).toMatchObject({ remainingGames: 1, unfilledSlots: 1 });
    const division = previewAndConfirm(tournament);
    const playerId = division.matches[0].playerIds![0][0];
    const withdrawn = tournament.act({ type: 'withdraw', divisionId: 'unidos', entryId: playerId, reason: 'Left before play' });
    expect(withdrawn.divisions.unidos.matches[0].result).toEqual({ type: 'cancelled', reason: 'Left before play' });
    expect(getRotationProgress(withdrawn)).toMatchObject({ remainingGames: 1, unfilledSlots: 0 });
    expect(previewAndConfirm(tournament).matches[1].playerIds!.flat()).not.toContain(playerId);
  });
});

describe('standings evidence', () => {
  it('sums each game by side and only uses points after comparable head-to-head and opponent samples', () => {
    const tournament = createTournamentFixture();
    fillUnidos(tournament, 4);
    tournament.act({ type: 'configure-division', divisionId: 'unidos', rules: {
      ...defaultDivisionRules('unidos'), gamesPerPlayer: 2,
    } });
    tournament.act({ type: 'lock-division', divisionId: 'unidos' });
    const first = previewAndConfirm(tournament).matches[0];
    play(tournament, 'unidos', first.id);
    const second = previewAndConfirm(tournament).matches[1];
    const [mixedWinLoss] = first.playerIds![0].filter(id => second.playerIds![0].includes(id));
    play(tournament, 'unidos', second.id, [[9, 11]]);
    const { rows } = getDivisionStandings(tournament.state, 'unidos').groups[0];
    const row = rows.find(item => item.entryId === mixedWinLoss)!;
    expect(row).toMatchObject({ pointDifferential: 6, scored: 2, wins: 1, played: 2 });
    expect(row.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'point-differential', value: 6, matchIds: [first.id, second.id] }),
    ]));
  });

  it('leaves joint places and skips point differential when a comparable tie contains a forfeit', () => {
    const tournament = createTournamentFixture();
    register(tournament, 'men', 3);
    tournament.act({ type: 'lock-division', divisionId: 'men' });
    const [first, second, third] = tournament.state.divisions.men.matches;
    play(tournament, 'men', first.id);
    play(tournament, 'men', second.id, [[3, 11]]);
    tournament.act({ type: 'record-result', divisionId: 'men', matchId: third.id, result: {
      type: 'forfeit', winner: 0, reason: 'Missed check-in',
    } });
    const standings = getDivisionStandings(tournament.state, 'men');
    expect(standings.provisional).toBe(false);
    expect(standings.jointChampionIds).toHaveLength(3);
    for (const row of standings.groups[0].rows) {
      expect(row).toMatchObject({ place: 1, joint: true });
      expect(row.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ metric: 'head-to-head', value: 1 }),
        expect.objectContaining({ metric: 'point-differential', value: null }),
      ]));
    }
  });
});

it('uses comparable head-to-head before points in a fixed division', () => {
  const tournament = createTournamentFixture();
  register(tournament, 'mixed', 4);
  tournament.act({ type: 'lock-division', divisionId: 'mixed' });
  const winners = new Map([
    ['mixed1,mixed2', 'mixed1'], ['mixed1,mixed3', 'mixed3'], ['mixed1,mixed4', 'mixed1'],
    ['mixed2,mixed3', 'mixed2'], ['mixed2,mixed4', 'mixed2'], ['mixed3,mixed4', 'mixed4'],
  ]);
  for (const match of tournament.state.divisions.mixed.matches) {
    const winner = winners.get([...match.teamIds!].sort().join(','))!;
    const losePoints = winner === 'mixed1' ? 9 : 3;
    play(tournament, 'mixed', match.id, [match.teamIds![0] === winner ? [11, losePoints] : [losePoints, 11]]);
  }
  const { groups, championId } = getDivisionStandings(tournament.state, 'mixed');
  expect(championId).toBe('mixed1');
  const [first, second] = groups[0].rows;
  expect(first.pointDifferential).toBeLessThan(second.pointDifferential);
  expect(first.evidence).toContainEqual(expect.objectContaining({ metric: 'head-to-head', value: 1 }));
});

it('keeps the rotating champion provisional until the configured tie playoff is recorded', () => {
  const tournament = createTournamentFixture();
  fillUnidos(tournament, 4);
  const rules = { ...defaultDivisionRules('unidos'), gamesPerPlayer: 1, tiePolicy: 'playoff' as const };
  expect(() => tournament.act({ type: 'configure-division', divisionId: 'unidos', rules: {
    ...rules, score: { ...rules.score, gamesToWin: 2 },
  } })).toThrow(/valid rules/);
  tournament.act({ type: 'configure-division', divisionId: 'unidos', rules });
  tournament.act({ type: 'lock-division', divisionId: 'unidos' });
  const { matches } = previewAndConfirm(tournament);
  const [winner, runnerUp] = matches[0].playerIds![0];
  const tie = { pool: null, orderedIds: [winner, runnerUp], reason: 'Recorded from the announced tie playoff' };
  expect(() => tournament.act({ type: 'resolve-tie', divisionId: 'unidos', tie })).toThrow(/Finish/);
  play(tournament, 'unidos', matches[0].id);
  expect(getDivisionStandings(tournament.state, 'unidos')).toMatchObject({ provisional: true, championId: null });
  tournament.act({ type: 'resolve-tie', divisionId: 'unidos', tie });
  expect(getDivisionStandings(tournament.state, 'unidos')).toMatchObject({ provisional: false, championId: winner });
});

it('replays the starting settings saved on the event and enforces a court’s time window', () => {
  const tournament = organizer();
  const settings = { ...defaultTournamentSettings(), courts: [{ id: '1', name: 'Court 1', availableFrom: 20 }] };
  tournament.act({ type: 'create', settings });
  const firstEvent = structuredClone(tournament.events[0]);
  firstEvent.initialRules!.mixed.score.pointsToWin = 15;
  expect(replayTournament([firstEvent])?.divisions.mixed.rules.score.pointsToWin).toBe(15);
  register(tournament, 'mixed', 2);
  const [match] = tournament.act({ type: 'lock-division', divisionId: 'mixed' }).divisions.mixed.matches;
  tournament.act({ type: 'assign-court', divisionId: 'mixed', matchId: match.id, courtId: '1' });
  expect(() => tournament.act({ type: 'start-match', divisionId: 'mixed', matchId: match.id })).toThrow(/availability window/);
});
