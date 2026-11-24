import type { DivisionId, MatchSource, TournamentDivision, TournamentMatch, TournamentTeam } from './types';

export function newMatch(
  divisionId: DivisionId,
  id: string,
  phase: TournamentMatch['phase'],
  round: number,
  pool: TournamentMatch['pool'] = null,
): TournamentMatch {
  return {
    id, divisionId, phase, round, pool, teamIds: null, playerIds: null, sources: null,
    courtId: null, startedAt: null, result: null, resultEventId: null, qualifierLocked: false,
  };
}

function roundRobin(
  id: DivisionId, teams: TournamentTeam[], pool: TournamentMatch['pool'],
): TournamentMatch[] {
  const rotation = [...teams];
  const seats = rotation.length + (rotation.length % 2);
  const matches: TournamentMatch[] = [];
  for (let round = 1; round < seats; round++) {
    for (let i = 0; i < seats / 2; i++) {
      const a = rotation[i];
      const b = rotation[seats - 1 - i];
      if (!a || !b) continue;
      matches.push({
        ...newMatch(id, id + ':' + (pool ?? 'rr') + ':' + round + ':' + i, pool ? 'pool' : 'round-robin', round, pool),
        teamIds: [a.id, b.id],
        playerIds: [a.playerIds, b.playerIds],
      });
    }
    // Preserve the bye's position when rotating an odd-sized pool.
    if (rotation.length < seats) rotation.length = seats;
    rotation.splice(1, 0, rotation.pop()!);
  }
  return matches;
}

export function hasValidFixtureSize(division: TournamentDivision, teamCount: number): boolean {
  const { competition } = division.rules;
  return competition.type === 'round-robin'
    ? teamCount >= 2
    : competition.poolSizes[0] + competition.poolSizes[1] === teamCount;
}

export function makeFixedFixtures(division: TournamentDivision, teams: TournamentTeam[]): TournamentMatch[] {
  const { competition } = division.rules;
  const { id } = division;
  if (competition.type === 'round-robin') return roundRobin(id, teams, null);

  const [firstSize] = competition.poolSizes;
  const matches = [...roundRobin(id, teams.slice(0, firstSize), 'A'), ...roundRobin(id, teams.slice(firstSize), 'B')];
  const advancing = competition.advancePerPool;
  const poolPlace = (pool: 'A' | 'B', place: number): MatchSource => ({ type: 'pool-place', pool, place });
  let sources: MatchSource[] = [];
  // Cross pools in the first round, with the top seeds on opposite halves.
  for (let i = 1; i <= advancing; i++) {
    const pair = [poolPlace('A', i), poolPlace('B', advancing + 1 - i)];
    sources.push(...(i % 2 ? pair : pair.reverse()));
  }
  for (let round = 1; sources.length > 1; round++) {
    const winners: MatchSource[] = [];
    for (let i = 0; i < sources.length; i += 2) {
      const matchId = id + ':playoff:' + round + ':' + i / 2;
      matches.push({ ...newMatch(id, matchId, 'playoff', round), sources: [sources[i], sources[i + 1]] });
      winners.push({ type: 'winner', matchId });
    }
    sources = winners;
  }
  return matches;
}

export function teamsFromDraw(pairs: [string, string][]): TournamentTeam[] {
  return pairs.map((playerIds, index) => ({
    id: 'unidos:team:' + (index + 1), name: 'Pair ' + (index + 1), playerIds,
  }));
}
