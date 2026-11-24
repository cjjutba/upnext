import { getRotationProgress } from './draw';
import { getMatchWinner } from './scoring';
import type {
  DivisionId, DivisionStandings, RankingEvidence, RankingMetric, Side, Standing,
  TournamentDivision, TournamentMatch, TournamentState,
} from './types';

interface Result {
  id: string;
  sides: [string[], string[]];
  winner: Side;
  differential: number | null;
}

function resultsFor(division: TournamentDivision, pool: 'A' | 'B' | null): Result[] {
  const results: Result[] = [];
  for (const match of division.matches) {
    if (match.pool !== pool || match.phase === 'playoff') continue;
    const winner = getMatchWinner(match, division.rules.score);
    const sides = match.phase === 'rotation' ? match.playerIds : match.teamIds?.map(id => [id]);
    if (winner === null || !sides) continue;
    results.push({
      id: match.id,
      sides: [sides[0], sides[1]],
      winner,
      differential: match.result?.type === 'played'
        ? match.result.games.reduce((sum, [a, b]) => sum + a - b, 0)
        : null,
    });
  }
  return results;
}

function sideFor(game: Result, id: string): Side | null {
  if (game.sides[0].includes(id)) return 0;
  return game.sides[1].includes(id) ? 1 : null;
}

function headToHead(group: Standing[], results: Result[]): RankingEvidence[] {
  const ids = group.map(row => row.entryId);
  const meetings = ids.map((id, i) => ids.slice(i + 1).map(other =>
    results.filter(game => {
      const side = sideFor(game, id);
      return side !== null && sideFor(game, other) === 1 - side;
    }),
  )).flat();
  const count = meetings[0]?.length ?? 0;
  const comparable = count > 0 && meetings.every(pair => pair.length === count);
  const games = [...new Set(meetings.flat())];
  return ids.map(id => ({
    metric: 'head-to-head',
    value: comparable ? games.reduce((sum, game) => {
      if (!game.sides[game.winner].includes(id)) return sum;
      return sum + game.sides[1 - game.winner].filter(other => ids.includes(other)).length;
    }, 0) : null,
    matchIds: games.filter(game => sideFor(game, id) !== null).map(game => game.id),
    reason: comparable
      ? 'Wins against tied entries with the same number of meetings for every pair.'
      : 'Tied entries did not meet each other equally often.',
  }));
}

function opponentWinRate(group: Standing[], results: Result[]): RankingEvidence[] {
  const samples = group.map(row => {
    const { entryId } = row;
    const opponents = new Set<string>();
    for (const game of results) {
      const side = sideFor(game, entryId);
      if (side !== null) for (const opponent of game.sides[1 - side]) opponents.add(opponent);
    }
    const counts = [...opponents].map(opponent => {
      const games = results.filter(game => sideFor(game, opponent) !== null && sideFor(game, entryId) === null);
      return { games, wins: games.filter(game => game.sides[game.winner].includes(opponent)).length };
    });
    return {
      complete: counts.length > 0 && counts.every(count => count.games.length > 0),
      games: [...new Set(counts.flatMap(count => count.games))],
      wins: counts.reduce((total, count) => total + count.wins, 0),
      total: counts.reduce((total, count) => total + count.games.length, 0),
    };
  });
  const complete = samples.every(sample => sample.complete);
  return samples.map(sample => ({
    metric: 'opponents-win-rate',
    value: complete ? sample.wins / sample.total : null,
    matchIds: sample.games.map(game => game.id),
    reason: complete
      ? sample.wins + ' wins in ' + sample.total + ' opponent appearances without this player.'
      : 'At least one opponent in this tied group has no result without the player they faced.',
  }));
}

function pointDifferential(group: Standing[], results: Result[]): RankingEvidence[] {
  const count = group[0].played;
  const comparable = count > 0 && group.every(row => row.scored === count && row.played === count);
  return group.map(row => ({
    metric: 'point-differential',
    value: comparable ? row.pointDifferential : null,
    matchIds: results.filter(game => game.differential !== null && sideFor(game, row.entryId) !== null).map(game => game.id),
    reason: comparable
      ? 'Total points scored minus points conceded across the same number of fully scored results.'
      : 'Tied entries do not have equal, complete score coverage.',
  }));
}

function splitBy<T>(rows: T[], value: (row: T) => number): T[][] {
  const groups: T[][] = [];
  for (const row of [...rows].sort((a, b) => value(b) - value(a))) {
    const group = groups.at(-1);
    if (group && value(group[0]) === value(row)) group.push(row);
    else groups.push([row]);
  }
  return groups;
}

function applyMetric(groups: Standing[][], evidence: (group: Standing[]) => RankingEvidence[]): Standing[][] {
  return groups.flatMap(group => {
    if (group.length < 2) return [group];
    const readings = evidence(group);
    group.forEach((row, i) => row.evidence.push(readings[i]));
    return splitBy(group, row => row.evidence.at(-1)?.value ?? 0);
  });
}

export function rankGroup(
  division: TournamentDivision, pool: 'A' | 'B' | null, provisional: boolean,
): Standing[] {
  const rotating = division.rules.mode === 'rotating';
  const results = resultsFor(division, pool);
  const teams = pool === null ? division.teams : division.teams.slice(
    pool === 'A' ? 0 : division.rules.competition.type === 'pools' ? division.rules.competition.poolSizes[0] : 0,
    pool === 'A' && division.rules.competition.type === 'pools' ? division.rules.competition.poolSizes[0] : undefined,
  );
  const ids = rotating ? division.entries.filter(entry => entry.clubMember).map(entry => entry.playerId) : teams.map(team => team.id);
  const rows: Standing[] = ids.map(entryId => {
    const played = results.filter(game => sideFor(game, entryId) !== null);
    const wins = played.filter(game => game.sides[game.winner].includes(entryId)).length;
    return {
      entryId, place: 0, joint: false, provisional,
      withdrawn: division.withdrawals.some(withdrawal => withdrawal.entryId === entryId),
      wins, played: played.length,
      pointDifferential: played.reduce((sum, game) => sum + (game.differential ?? 0) * (sideFor(game, entryId) === 0 ? 1 : -1), 0),
      scored: played.filter(game => game.differential !== null).length,
      evidence: [{ metric: 'wins', value: wins, matchIds: played.map(game => game.id), reason: 'Recorded wins, including awarded forfeits.' }],
    };
  });
  let groups = splitBy(rows.filter(row => !row.withdrawn), row => row.wins);
  groups = applyMetric(groups, group => headToHead(group, results));
  if (rotating) groups = applyMetric(groups, group => opponentWinRate(group, results));
  groups = applyMetric(groups, group => pointDifferential(group, results));
  groups = applyMetric(groups, group => {
    const tie = division.tieResolutions.find(item => item.pool === pool
      && item.orderedIds.length === group.length && group.every(row => item.orderedIds.includes(row.entryId)));
    return group.map(row => ({
      metric: 'tie-playoff' as RankingMetric,
      value: tie ? tie.orderedIds.length - tie.orderedIds.indexOf(row.entryId) : null,
      matchIds: [],
      reason: tie?.reason ?? 'The score and matchup rules leave these entries tied.',
    }));
  });
  let place = 1;
  for (const group of groups) {
    for (const row of group) {
      row.place = place;
      row.joint = group.length > 1;
    }
    place += group.length;
  }
  return [...groups.flat(), ...rows.filter(row => row.withdrawn)];
}

export function poolComplete(division: TournamentDivision, pool: 'A' | 'B'): boolean {
  const matches = division.matches.filter(match => match.pool === pool);
  return matches.length > 0 && matches.every(match => match.result !== null);
}

export function divisionQualifyingComplete(state: TournamentState, division: TournamentDivision): boolean {
  if (!division.locked) return false;
  if (division.rules.mode === 'rotating') {
    const progress = getRotationProgress(state);
    return progress.players.length > 0 && progress.players.every(player => player.remaining === 0 && player.scheduled === 0);
  }
  const fixtures = division.matches.filter(match => match.phase !== 'playoff');
  return fixtures.length > 0 && fixtures.every(match => match.result !== null);
}

export function getDivisionStandings(state: TournamentState, divisionId: DivisionId): DivisionStandings {
  const division = state.divisions[divisionId];
  const pooled = division.rules.mode !== 'rotating' && division.rules.competition.type === 'pools';
  const pools = pooled ? ['A', 'B'] as const : [null];
  const complete = divisionQualifyingComplete(state, division);
  const groups = pools.map(pool => ({ pool, rows: rankGroup(division, pool, pool ? !poolComplete(division, pool) : !complete) }));
  const final = pooled ? division.matches.filter(match => match.phase === 'playoff').at(-1) : undefined;
  const winner = final ? getMatchWinner(final, division.rules.score) : null;
  const leaders = groups[0].rows.filter(row => row.place === 1);
  const awaitingTiePlayoff = !pooled && leaders.length > 1 && division.rules.tiePolicy === 'playoff';
  const hasResult = division.matches.some(match => getMatchWinner(match, division.rules.score) !== null);
  const provisional = !complete || (pooled ? winner === null : leaders.length === 0) || awaitingTiePlayoff || !hasResult;
  return {
    groups: awaitingTiePlayoff ? groups.map(group => ({
      ...group, rows: group.rows.map(row => row.place === 1 ? { ...row, provisional: true } : row),
    })) : groups,
    provisional,
    championId: provisional ? null : pooled ? final?.teamIds?.[winner!] ?? null : leaders.length === 1 ? leaders[0].entryId : null,
    jointChampionIds: !provisional && !pooled && leaders.length > 1 ? leaders.map(row => row.entryId) : [],
  };
}

export function winnerTeam(match: TournamentMatch | undefined, division: TournamentDivision): string | null {
  if (!match) return null;
  const winner = getMatchWinner(match, division.rules.score);
  return winner === null ? null : match.teamIds?.[winner] ?? null;
}
