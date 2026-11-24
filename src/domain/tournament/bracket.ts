import { TournamentCommandError } from './errors';
import { poolComplete, rankGroup, winnerTeam } from './standings';
import type {
  MatchSource, QualifierResolution, TournamentDivision, TournamentEvent, TournamentMatch,
} from './types';

function settleWithdrawal(
  match: TournamentMatch, division: TournamentDivision, eventId: string, reason?: string,
): TournamentMatch {
  if (match.result) return match;
  const entries = match.phase === 'rotation' ? match.playerIds : match.teamIds?.map(id => [id]);
  if (!entries) return match;
  const withdrawal = (side: string[]) => division.withdrawals.find(row => side.includes(row.entryId));
  const left = withdrawal(entries[0]);
  const right = withdrawal(entries[1]);
  if (!left && !right) return match;
  const resultReason = reason ?? (left ?? right)!.reason;
  return {
    ...match,
    result: (left && right) || division.rules.withdrawalPolicy === 'cancel'
      ? { type: 'cancelled', reason: resultReason }
      : { type: 'forfeit', winner: left ? 1 : 0, reason: resultReason },
    resultEventId: eventId,
  };
}

export function applyWithdrawals(division: TournamentDivision, event: TournamentEvent): TournamentDivision {
  const matches = division.matches.map(match => settleWithdrawal(
    match, division, event.id, event.action.type === 'withdraw' ? event.action.reason : undefined,
  ));
  return { ...division, matches };
}

export function updateBracket(
  division: TournamentDivision, event: TournamentEvent, resolution?: QualifierResolution,
): TournamentDivision {
  if (division.rules.competition.type !== 'pools' || !division.matches.some(match => match.sources)) return division;
  const seeds = new Map<string, string>();
  for (const pool of ['A', 'B'] as const) {
    if (!poolComplete(division, pool)) continue;
    for (const row of rankGroup(division, pool, false)) {
      if (!row.joint && row.place > 0) seeds.set(pool + ':' + row.place, row.entryId);
    }
  }
  const output: TournamentMatch[] = [];
  const byId = new Map<string, TournamentMatch>();
  const teams = new Map(division.teams.map(team => [team.id, team]));
  const conflicts: string[] = [];
  const resolve = (source: MatchSource) => source.type === 'pool-place'
    ? seeds.get(source.pool + ':' + source.place) ?? null
    : winnerTeam(byId.get(source.matchId), division);

  const seeded = (match: TournamentMatch) => match.sources?.every(source => source.type === 'pool-place');
  const matchesSeeds = (match: TournamentMatch, a: string | null, b: string | null) =>
    a && b ? match.teamIds?.[0] === a && match.teamIds[1] === b : match.teamIds === null;
  const keepFirstRound = resolution?.policy !== 'reset-affected' && division.matches.some(match => {
    if (!seeded(match)) return false;
    const [a, b] = match.sources!.map(resolve);
    return !matchesSeeds(match, a, b) && (match.qualifierLocked
      || (resolution?.policy === 'keep-started' && (match.startedAt !== null || match.result !== null)));
  });

  for (const match of division.matches) {
    let next = match;
    if (match.sources) {
      const [a, b] = match.sources.map(resolve);
      const same = matchesSeeds(match, a, b);
      if (same && match.qualifierLocked) {
        next = { ...match, qualifierLocked: false };
      } else if (!same) {
        const protectedMatch = match.startedAt !== null || match.result !== null;
        // A seed swap changes both first-round fixtures. Retaining one lineup
        // while updating the other could enter the same team twice.
        if (keepFirstRound && seeded(match)) {
          next = { ...match, qualifierLocked: true };
        } else if (protectedMatch && resolution?.policy !== 'reset-affected') {
          if (!match.qualifierLocked && resolution?.policy !== 'keep-started') conflicts.push(match.id);
          next = { ...match, qualifierLocked: true };
        } else {
          const left = a ? teams.get(a) : undefined;
          const right = b ? teams.get(b) : undefined;
          next = {
            ...match,
            teamIds: left && right ? [left.id, right.id] : null,
            playerIds: left && right ? [left.playerIds, right.playerIds] : null,
            courtId: null,
            startedAt: null,
            result: null,
            resultEventId: null,
            qualifierLocked: false,
          };
          next = settleWithdrawal(next, division, event.id);
        }
      }
    }
    output.push(next);
    byId.set(next.id, next);
  }
  if (conflicts.length) {
    throw new TournamentCommandError(
      'The change affects a playoff match that already started or has a result. Confirm how to handle it.',
      'qualifier-conflict',
      conflicts,
    );
  }
  return { ...division, matches: output };
}
