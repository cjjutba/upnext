import type { DivisionId, DivisionRules, TournamentSettings } from './types';

export function defaultTournamentSettings(): TournamentSettings {
  return { name: 'Unidos and Plaridel Open', date: '', courts: [{ id: '1', name: 'Court 1' }] };
}

export function defaultDivisionRules(id: DivisionId): DivisionRules {
  return {
    mode: id === 'unidos' ? 'rotating' : 'fixed-teams',
    gamesPerPlayer: 6,
    competition: { type: 'round-robin' },
    score: { pointsToWin: 11, winBy: 2, gamesToWin: 1, pointCap: null },
    tiePolicy: 'joint',
    withdrawalPolicy: 'forfeit',
  };
}
