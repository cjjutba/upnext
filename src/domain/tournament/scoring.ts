import type { Score, ScoreFormat, Side, TournamentMatch } from './types';

export function validateScores(games: readonly Score[], format: ScoreFormat): Side | null {
  const wins = [0, 0];
  for (const game of games) {
    if (wins.includes(format.gamesToWin) || !Array.isArray(game) || game.length !== 2) return null;
    const [a, b] = game;
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0 || a === b) return null;
    const winner = a > b ? 0 : 1;
    const winning = game[winner];
    const losing = game[1 - winner];
    const required = Math.min(format.pointCap ?? Infinity, Math.max(format.pointsToWin, losing + format.winBy));
    if (winning !== required) return null;
    wins[winner]++;
  }
  if (wins[0] === format.gamesToWin) return 0;
  if (wins[1] === format.gamesToWin) return 1;
  return null;
}

export function getMatchWinner(match: TournamentMatch, format: ScoreFormat): Side | null {
  const { result } = match;
  if (result?.type === 'played') return validateScores(result.games, format);
  return result?.type === 'forfeit' ? result.winner : null;
}
