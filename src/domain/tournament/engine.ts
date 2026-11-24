import { applyWithdrawals, updateBracket } from './bracket';
import { defaultDivisionRules } from './defaults';
import { eligibleEntries, getRotationProgress, proposeDraw } from './draw';
import { requireTournament, TournamentCommandError } from './errors';
import { hasValidFixtureSize, makeFixedFixtures, newMatch, teamsFromDraw } from './fixtures';
import { validateScores } from './scoring';
import { divisionQualifyingComplete, poolComplete, rankGroup } from './standings';
import { DIVISION_IDS } from './types';
import type {
  Draw, MatchResult, PlayerPair, TournamentAction, TournamentDivision, TournamentEvent,
  TournamentMatch, TournamentSettings, TournamentState,
} from './types';
import { divisionId, filled, integer, record, sameData, validResolution, validRules, validSettings } from './validation';

type Envelope = Omit<TournamentEvent, 'v' | 'action' | 'initialRules' | 'draw' | 'fixtures'>;

function newDivision(id: TournamentDivision['id'], rules: TournamentDivision['rules']): TournamentDivision {
  return {
    id, rules, locked: false, entries: [], teams: [],
    withdrawals: [], draw: null, confirmedDraws: [], matches: [], tieResolutions: [],
  };
}

function checkCourt(state: TournamentState, match: TournamentMatch, courtId: string): void {
  requireTournament(state.settings.courts.some(court => court.id === courtId), 'Choose a court from this tournament.');
  const players = new Set(match.playerIds?.flat());
  const conflicts = Object.values(state.divisions).flatMap(division => division.matches).filter(other =>
    other.id !== match.id && other.courtId !== null && !other.result
    && (courtId === other.courtId || other.playerIds?.flat().some(id => players.has(id))),
  );
  if (conflicts.length) {
    throw new TournamentCommandError(
      'The court or a player is booked for another match.',
      'court-conflict',
      conflicts.map(other => other.id),
    );
  }
}

function isPair(value: unknown): value is PlayerPair {
  return Array.isArray(value) && value.length === 2 && value.every(filled) && value[0] !== value[1];
}

function rotationDrawFits(progress: ReturnType<typeof getRotationProgress>, draw: Draw): boolean {
  const players = draw.pairs.flat();
  const top = progress.players.map(player => player.remaining).sort((a, b) => b - a).slice(0, 4);
  const drawn = progress.players.filter(player => players.includes(player.playerId)).map(player => player.remaining).sort((a, b) => b - a);
  return progress.remainingGames > 0 && players.length === 4 && sameData(top, drawn);
}

function reconcileRotation(state: TournamentState, division: TournamentDivision): TournamentDivision {
  if (division.rules.mode !== 'rotating') return division;
  const progress = getRotationProgress({ ...state, divisions: { ...state.divisions, unidos: division } });
  requireTournament(progress.players.every(player => player.remaining >= 0),
    'This result would exceed a player’s game target after later draws.');
  return division.draw && !rotationDrawFits(progress, division.draw) ? { ...division, draw: null } : division;
}

function checkDraw(state: TournamentState, event: TournamentEvent): Draw {
  const division = state.divisions.unidos;
  const draw = event.draw;
  requireTournament(!division.draw, 'Confirm the existing draw first.');
  requireTournament(division.rules.mode === 'rotating' ? division.locked : division.rules.mode === 'blind-teams' && !division.locked,
    'Set and lock the rotating rules first, or choose the blind fixed pair draw.');
  requireTournament(draw, division.rules.mode === 'rotating'
    ? 'No further games fit the remaining player quotas.'
    : 'Register an even number of at least four eligible club members.');
  requireTournament(record(draw) && draw.id === event.id && draw.kind === division.rules.mode
    && Array.isArray(draw.pairs) && draw.pairs.every(isPair)
    && Array.isArray(draw.explanation) && draw.explanation.every(filled), 'The draw is unavailable or invalid.');
  const players = draw.pairs.flat();
  const eligible = eligibleEntries(division);
  requireTournament(new Set(players).size === players.length && players.every(id => eligible.includes(id)), 'Every draw seat needs a different eligible player.');
  if (draw.kind === 'blind-teams') {
    requireTournament(eligible.length === players.length && players.length >= 4 && hasValidFixtureSize(division, draw.pairs.length),
      'A blind team draw needs an even number of eligible club members and a matching fixture size.');
  } else {
    requireTournament(rotationDrawFits(getRotationProgress(state), draw),
      'There are not enough eligible players at the required game quotas.');
  }
  return draw;
}

function checkResult(result: MatchResult, match: TournamentMatch, division: TournamentDivision): void {
  requireTournament(record(result), 'Provide a result.');
  if (result.type === 'played') {
    requireTournament(match.startedAt !== null, 'Start the match before recording its score.');
    requireTournament(Array.isArray(result.games) && validateScores(result.games, division.rules.score) !== null,
      'Enter completed game scores for the selected scoring format.');
    return;
  }
  requireTournament((result.type === 'forfeit' && (result.winner === 0 || result.winner === 1) || result.type === 'cancelled')
    && filled(result.reason), 'A forfeit or cancellation needs a reason.');
}

function applyMatch(
  state: TournamentState, division: TournamentDivision,
  event: TournamentEvent & { action: Extract<TournamentAction, { matchId: string }> },
): TournamentDivision {
  const { action } = event;
  const current = division.matches.find(match => match.id === action.matchId);
  requireTournament(current?.playerIds && division.locked, 'This match is waiting for its players.');
  let next: TournamentMatch;
  switch (action.type) {
    case 'assign-court':
      requireTournament(!current.result && current.startedAt === null, 'Only unplayed matches can be assigned.');
      if (action.courtId !== null) checkCourt(state, current, action.courtId);
      next = { ...current, courtId: action.courtId };
      break;
    case 'start-match': {
      requireTournament(current.courtId && !current.result && current.startedAt === null, 'Assign a court to an unplayed match first.');
      checkCourt(state, current, current.courtId);
      const court = state.settings.courts.find(item => item.id === current.courtId)!;
      requireTournament(event.ts >= (court.availableFrom ?? 0) && event.ts < (court.availableUntil ?? Infinity),
        'This court is outside its availability window.');
      next = { ...current, startedAt: event.ts };
      break;
    }
    case 'record-result':
      requireTournament(!current.result, 'This match already has a result. Use score correction.');
      checkResult(action.result, current, division);
      next = { ...current, result: action.result, resultEventId: event.id };
      break;
    case 'correct-result':
      if (!current.result || !filled(action.expectedResultId) || current.resultEventId !== action.expectedResultId) {
        throw new TournamentCommandError('The result changed. Reload it before correcting.', 'stale-revision');
      }
      requireTournament(filled(action.reason) && validResolution(action.resolution), 'Supply a reason for the correction and any playoff resolution.');
      checkResult(action.result, current, division);
      next = { ...current, result: action.result, resultEventId: event.id };
      break;
  }
  const updated = { ...division, matches: division.matches.map(match => match === current ? next : match) };
  const quotaChanged = (current.result?.type === 'cancelled') !== (next.result?.type === 'cancelled');
  return updateBracket(quotaChanged ? reconcileRotation(state, updated) : updated, event,
    action.type === 'correct-result' ? action.resolution : undefined);
}

function applyDivision(state: TournamentState, event: TournamentEvent): TournamentDivision {
  const { action } = event;
  requireTournament('divisionId' in action && divisionId(action.divisionId), 'Choose a tournament division.');
  const division = state.divisions[action.divisionId];
  const unlocked = !division.locked && division.draw === null;

  switch (action.type) {
    case 'configure-division':
      requireTournament(unlocked && validRules(division.id, action.rules), 'Choose valid rules before the division or draw locks.');
      return { ...division, rules: action.rules };
    case 'set-entry':
      requireTournament(unlocked && division.id === 'unidos' && filled(action.playerId) && typeof action.clubMember === 'boolean',
        'Set Unidos club eligibility during setup.');
      return { ...division, entries: [...division.entries.filter(entry => entry.playerId !== action.playerId),
        { playerId: action.playerId, clubMember: action.clubMember }] };
    case 'remove-entry':
      requireTournament(unlocked && division.id === 'unidos' && division.entries.some(entry => entry.playerId === action.playerId),
        'Remove Unidos entries before the division or draw locks.');
      return { ...division, entries: division.entries.filter(entry => entry.playerId !== action.playerId) };
    case 'set-team': {
      requireTournament(unlocked && division.rules.mode === 'fixed-teams', 'Register open division teams during setup.');
      const team = action.team;
      requireTournament(record(team) && filled(team.id) && filled(team.name) && isPair(team.playerIds)
        && !division.teams.some(other => other.id !== team.id && other.playerIds.some(id => team.playerIds.includes(id))),
      'Choose two different players who are free to enter this division.');
      const index = division.teams.findIndex(other => other.id === team.id);
      return { ...division, teams: index < 0 ? [...division.teams, team] : division.teams.map((other, i) => i === index ? team : other) };
    }
    case 'remove-team':
      requireTournament(unlocked && division.teams.some(team => team.id === action.teamId), 'Remove teams before locking the division.');
      return { ...division, teams: division.teams.filter(team => team.id !== action.teamId) };
    case 'lock-division':
      requireTournament(unlocked && division.rules.mode !== 'blind-teams', 'Confirm the blind draw to lock these teams.');
      if (division.rules.mode === 'rotating') {
        requireTournament(eligibleEntries(division).length >= 4, 'Register at least four eligible club members.');
      } else {
        requireTournament(hasValidFixtureSize(division, division.teams.length) && Array.isArray(event.fixtures),
          'Register enough teams to match the fixture settings.');
      }
      return { ...division, locked: true, matches: event.fixtures ?? [] };
    case 'preview-draw':
      requireTournament(division.id === 'unidos', 'Blind draws are for Unidos.');
      return { ...division, draw: checkDraw(state, event) };
    case 'discard-draw':
      requireTournament(division.id === 'unidos' && division.draw && division.draw.id === action.drawId, 'Discard the draw that is currently saved.');
      return { ...division, draw: null };
    case 'confirm-draw': {
      const { draw } = division;
      requireTournament(division.id === 'unidos' && draw && draw.id === action.drawId && Array.isArray(event.fixtures),
        'Confirm the draw that is currently saved.');
      return {
        ...division, locked: true, draw: null, confirmedDraws: [...division.confirmedDraws, draw],
        teams: draw.kind === 'blind-teams' ? teamsFromDraw(draw.pairs) : division.teams,
        matches: [...division.matches, ...event.fixtures],
      };
    }
    case 'assign-court':
    case 'start-match':
    case 'record-result':
    case 'correct-result':
      return applyMatch(state, division, { ...event, action });
    case 'withdraw': {
      const isRotating = division.rules.mode === 'rotating';
      const ids = isRotating ? eligibleEntries(division) : division.teams.map(team => team.id);
      requireTournament(division.locked && ids.includes(action.entryId) && filled(action.reason)
        && validResolution(action.resolution) && !division.withdrawals.some(entry => entry.entryId === action.entryId),
      'Choose an active entry and supply a withdrawal reason.');
      const updated = applyWithdrawals({
        ...division,
        withdrawals: [...division.withdrawals, { entryId: action.entryId, reason: action.reason }],
        draw: division.draw?.pairs.flat().includes(action.entryId) ? null : division.draw,
      }, event);
      return updateBracket(reconcileRotation(state, updated), event, action.resolution);
    }
    case 'resolve-tie': {
      const { tie, resolution } = action;
      const pooled = division.rules.competition.type === 'pools';
      requireTournament(division.locked && division.rules.tiePolicy === 'playoff' && record(tie)
        && filled(tie.reason) && validResolution(resolution) && (pooled ? tie.pool === 'A' || tie.pool === 'B' : tie.pool === null)
        && Array.isArray(tie.orderedIds) && tie.orderedIds.length > 1 && tie.orderedIds.every(filled)
        && new Set(tie.orderedIds).size === tie.orderedIds.length,
      'Enter the playoff order and describe the tie playoff under the locked rules.');
      requireTournament(tie.pool ? poolComplete(division, tie.pool) : divisionQualifyingComplete(state, division),
        'Finish the qualifying games before resolving a tie.');
      const rows = rankGroup(division, tie.pool, false);
      const first = rows.find(row => row.entryId === tie.orderedIds[0] && row.joint);
      const tied = first ? rows.filter(row => row.place === first.place).map(row => row.entryId) : [];
      requireTournament(tied.length === tie.orderedIds.length && tied.every(id => tie.orderedIds.includes(id)),
        'The playoff order needs every entry in the current tie.');
      return updateBracket({ ...division, tieResolutions: [...division.tieResolutions, tie] }, event, resolution);
    }
  }
}

function create(state: TournamentState | null, event: TournamentEvent, settings: TournamentSettings): TournamentState {
  requireTournament(state === null && event.seq === 1 && validSettings(settings), 'Create a tournament with a name and available courts.');
  const rules = event.initialRules;
  requireTournament(rules && DIVISION_IDS.every(id => validRules(id, rules[id])), 'The starting division rules are invalid.');
  return {
    id: event.tournamentId, settings, createdAt: event.ts, updatedAt: event.ts, revision: event.seq,
    divisions: {
      unidos: newDivision('unidos', rules.unidos),
      women: newDivision('women', rules.women),
      mixed: newDivision('mixed', rules.mixed),
      men: newDivision('men', rules.men),
    },
  };
}

export function advanceTournament(state: TournamentState | null, event: TournamentEvent): TournamentState {
  requireTournament(record(event) && event.v === 1 && filled(event.id) && filled(event.tournamentId)
    && integer(event.ts) && integer(event.seq, 1) && record(event.action), 'Invalid tournament event.');
  const { action } = event;
  if (action.type === 'create') return create(state, event, action.settings);
  requireTournament(state && state.id === event.tournamentId && event.seq === state.revision + 1, 'The tournament event sequence is invalid.');
  const metadata = { updatedAt: event.ts, revision: event.seq };
  if (action.type === 'update-settings') {
    requireTournament(validSettings(action.settings), 'Choose valid tournament settings and courts.');
    const reservations = Object.values(state.divisions).flatMap(division => division.matches).filter(match => match.courtId && !match.result);
    for (const match of reservations) {
      const court = action.settings.courts.find(item => item.id === match.courtId);
      requireTournament(court, 'Clear the court assignment before removing the court.');
      requireTournament(match.startedAt === null
        || (match.startedAt >= (court.availableFrom ?? 0) && match.startedAt < (court.availableUntil ?? Infinity)),
      'Keep the availability window open for matches already on the court.');
    }
    return { ...state, ...metadata, settings: action.settings };
  }
  const division = applyDivision(state, event);
  requireTournament(division && DIVISION_IDS.includes(division.id), 'Unknown tournament action.');
  return { ...state, ...metadata, divisions: { ...state.divisions, [division.id]: division } };
}

function fixturesFor(state: TournamentState | null, action: TournamentAction): TournamentMatch[] | undefined {
  if (!state) return undefined;
  if (action.type === 'confirm-draw') {
    const division = state.divisions.unidos;
    const { draw } = division;
    if (!draw || draw.id !== action.drawId) return undefined;
    return draw.kind === 'rotating'
      ? [{ ...newMatch('unidos', draw.id, 'rotation', division.confirmedDraws.length + 1),
        playerIds: [draw.pairs[0], draw.pairs[1]] }]
      : makeFixedFixtures(division, teamsFromDraw(draw.pairs));
  }
  if (action.type === 'lock-division' && divisionId(action.divisionId)) {
    const division = state.divisions[action.divisionId];
    if (division.rules.mode === 'fixed-teams' && hasValidFixtureSize(division, division.teams.length)) {
      return makeFixedFixtures(division, division.teams);
    }
  }
  return undefined;
}

export function prepareTournamentEvent(
  state: TournamentState | null, action: TournamentAction, envelope: Envelope, random: () => number,
): TournamentEvent {
  const event: TournamentEvent = { v: 1, ...envelope, action };
  if (action.type === 'create') {
    event.initialRules = {
      unidos: defaultDivisionRules('unidos'),
      women: defaultDivisionRules('women'),
      mixed: defaultDivisionRules('mixed'),
      men: defaultDivisionRules('men'),
    };
  }
  if (action.type === 'preview-draw' && state && !state.divisions.unidos.draw) {
    const draw = proposeDraw(state, event.id, random);
    if (draw) event.draw = draw;
  }
  const fixtures = fixturesFor(state, action);
  if (fixtures) event.fixtures = fixtures;
  advanceTournament(state, event);
  return event;
}

/** Backup validation checks generated fixture structure. Normal replay uses the saved fixtures. */
export function validateTournamentEvent(state: TournamentState | null, event: TournamentEvent): TournamentState {
  requireTournament(record(event) && record(event.action), 'Invalid tournament event.');
  requireTournament((event.action.type === 'create' || event.initialRules === undefined)
    && (event.action.type === 'preview-draw' || event.draw === undefined)
    && sameData(event.fixtures, fixturesFor(state, event.action)), 'The saved tournament fixture list is invalid.');
  return advanceTournament(state, event);
}

export function replayTournament(events: readonly TournamentEvent[]): TournamentState | null {
  let state: TournamentState | null = null;
  for (const event of events) {
    try {
      state = advanceTournament(state, event);
    } catch (error) {
      if (!(error instanceof TournamentCommandError)) throw error;
    }
  }
  return state;
}
