export type TournamentErrorCode =
  'invalid-action' | 'court-conflict' | 'qualifier-conflict' | 'stale-revision' | 'backup-conflict';

export class TournamentCommandError extends Error {
  readonly code: TournamentErrorCode;
  readonly matchIds: string[];

  constructor(message: string, code: TournamentErrorCode = 'invalid-action', matchIds: string[] = []) {
    super(message);
    this.name = 'TournamentCommandError';
    this.code = code;
    this.matchIds = matchIds;
  }
}

export function requireTournament(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TournamentCommandError(message);
}
