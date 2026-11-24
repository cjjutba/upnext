import type {
  Draw, PlayerPair, RotationProgress, TournamentDivision, TournamentState,
} from './types';

export function eligibleEntries(division: TournamentDivision): string[] {
  const withdrawn = new Set(division.withdrawals.map(entry => entry.entryId));
  return division.entries.filter(entry => entry.clubMember && !withdrawn.has(entry.playerId)).map(entry => entry.playerId);
}

function shuffled<T>(values: T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getRotationProgress(state: TournamentState): RotationProgress {
  const division = state.divisions.unidos;
  if (division.rules.mode !== 'rotating') return { players: [], remainingGames: 0, unfilledSlots: 0, explanation: [] };
  const rows = new Map(eligibleEntries(division).map(playerId => [
    playerId, { playerId, played: 0, scheduled: 0, remaining: division.rules.gamesPerPlayer },
  ]));
  for (const match of division.matches) {
    if (match.result?.type === 'cancelled') continue;
    for (const playerId of match.playerIds?.flat() ?? []) {
      const row = rows.get(playerId);
      if (!row) continue;
      if (match.result) row.played++;
      else row.scheduled++;
      row.remaining--;
    }
  }
  const players = [...rows.values()];
  const remaining = players.map(row => row.remaining);
  const total = remaining.reduce((sum, slots) => sum + slots, 0);
  let lower = 0;
  let upper = Math.floor(total / 4);
  // One player can fill at most one seat in each remaining game.
  while (lower < upper) {
    const games = Math.ceil((lower + upper) / 2);
    const seats = remaining.reduce((sum, slots) => sum + Math.min(slots, games), 0);
    if (seats >= 4 * games) lower = games;
    else upper = games - 1;
  }
  const remainingGames = lower;
  const unfilledSlots = total - remainingGames * 4;
  const explanation: string[] = [];
  if (total % 4) explanation.push('The remaining player slots do not divide into groups of four.');
  if (unfilledSlots > total % 4) explanation.push('Too few players have games left to fill every remaining slot.');
  return { players, remainingGames, unfilledSlots, explanation };
}

function key(a: string, b: string): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

export function proposeDraw(state: TournamentState, id: string, random: () => number): Draw | null {
  const division = state.divisions.unidos;
  if (division.rules.mode === 'blind-teams') {
    const players = shuffled(eligibleEntries(division), random);
    if (players.length < 4 || players.length % 2) return null;
    const pairs: PlayerPair[] = [];
    for (let i = 0; i < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    return { id, kind: 'blind-teams', pairs, explanation: ['Every eligible club member was drawn into one fixed pair.'] };
  }

  const progress = getRotationProgress(state);
  if (progress.remainingGames === 0) return null;
  const partnerCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();
  const busyPlayers = new Set(
    Object.values(state.divisions).flatMap(item => item.matches)
      .filter(match => match.courtId && !match.result)
      .flatMap(match => match.playerIds?.flat() ?? []),
  );
  for (const match of division.matches) {
    if (!match.playerIds || match.result?.type === 'cancelled') continue;
    const [left, right] = match.playerIds;
    for (const pair of [left, right]) {
      const pairKey = key(...pair);
      partnerCounts.set(pairKey, (partnerCounts.get(pairKey) ?? 0) + 1);
    }
    for (const a of left) for (const b of right) {
      const pairKey = key(a, b);
      opponentCounts.set(pairKey, (opponentCounts.get(pairKey) ?? 0) + 1);
    }
  }

  const candidates = shuffled(progress.players.filter(row => row.remaining > 0), random);
  const players: string[] = [];
  const repeats = (a: string, b: string) => (partnerCounts.get(key(a, b)) ?? 0) + (opponentCounts.get(key(a, b)) ?? 0);
  while (players.length < 4) {
    const familiarity = (playerId: string) => players.reduce((sum, player) => sum + repeats(player, playerId), 0);
    candidates.sort((a, b) => b.remaining - a.remaining
      || Number(busyPlayers.has(a.playerId)) - Number(busyPlayers.has(b.playerId))
      || familiarity(a.playerId) - familiarity(b.playerId));
    players.push(candidates.shift()!.playerId);
  }

  const [a, b, c, d] = players;
  const partitions: [PlayerPair, PlayerPair][] = [
    [[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]],
  ];
  const partners = (pairs: PlayerPair[]) => pairs.reduce((sum, pair) => sum + (partnerCounts.get(key(...pair)) ?? 0), 0);
  const opponents = ([left, right]: PlayerPair[]) => left.reduce((sum, x) =>
    sum + right.reduce((count, y) => count + (opponentCounts.get(key(x, y)) ?? 0), 0), 0);
  const [pairs] = shuffled(partitions, random).sort((x, y) => partners(x) - partners(y) || opponents(x) - opponents(y));
  return {
    id,
    kind: 'rotating',
    pairs,
    explanation: [
      'Players with the most games left are drawn first. Among tied players, available players and fewer repeat meetings take priority.',
      'The two pairs minimize repeat partnerships, then repeat opponents for the four drawn players.',
      ...progress.explanation,
    ],
  };
}
