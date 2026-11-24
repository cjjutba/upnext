export const DIVISION_IDS = ['unidos', 'women', 'mixed', 'men'] as const;
export type DivisionId = (typeof DIVISION_IDS)[number];
export type PlayerPair = [string, string];
export type Score = [number, number];
export type Side = 0 | 1;

export interface TournamentCourt {
  id: string;
  name: string;
  availableFrom?: number;
  availableUntil?: number;
}

export interface TournamentSettings {
  name: string;
  date: string;
  courts: TournamentCourt[];
}

export interface ScoreFormat {
  pointsToWin: number;
  winBy: number;
  gamesToWin: number;
  pointCap: number | null;
}

export type CompetitionFormat =
  | { type: 'round-robin' }
  | { type: 'pools'; poolSizes: [number, number]; advancePerPool: number };

export interface DivisionRules {
  mode: 'rotating' | 'blind-teams' | 'fixed-teams';
  gamesPerPlayer: number;
  competition: CompetitionFormat;
  score: ScoreFormat;
  tiePolicy: 'joint' | 'playoff';
  withdrawalPolicy: 'forfeit' | 'cancel';
}

export interface TournamentTeam {
  id: string;
  name: string;
  playerIds: PlayerPair;
}

export interface Draw {
  id: string;
  kind: 'rotating' | 'blind-teams';
  pairs: PlayerPair[];
  explanation: string[];
}

export type MatchSource =
  | { type: 'pool-place'; pool: 'A' | 'B'; place: number }
  | { type: 'winner'; matchId: string };

export type MatchResult =
  | { type: 'played'; games: Score[] }
  | { type: 'forfeit'; winner: Side; reason: string }
  | { type: 'cancelled'; reason: string };

export interface TournamentMatch {
  id: string;
  divisionId: DivisionId;
  phase: 'rotation' | 'round-robin' | 'pool' | 'playoff';
  pool: 'A' | 'B' | null;
  round: number;
  teamIds: [string, string] | null;
  playerIds: [PlayerPair, PlayerPair] | null;
  sources: [MatchSource, MatchSource] | null;
  courtId: string | null;
  startedAt: number | null;
  result: MatchResult | null;
  resultEventId: string | null;
  qualifierLocked: boolean;
}

export interface TournamentDivision {
  id: DivisionId;
  rules: DivisionRules;
  locked: boolean;
  entries: { playerId: string; clubMember: boolean }[];
  teams: TournamentTeam[];
  withdrawals: { entryId: string; reason: string }[];
  draw: Draw | null;
  confirmedDraws: Draw[];
  matches: TournamentMatch[];
  tieResolutions: TieResolution[];
}

export interface TieResolution {
  pool: 'A' | 'B' | null;
  orderedIds: string[];
  reason: string;
}

export interface TournamentState {
  id: string;
  settings: TournamentSettings;
  createdAt: number;
  updatedAt: number;
  revision: number;
  divisions: Record<DivisionId, TournamentDivision>;
}

export interface QualifierResolution {
  policy: 'keep-started' | 'reset-affected';
  reason: string;
}

export type TournamentAction =
  | { type: 'create'; settings: TournamentSettings }
  | { type: 'update-settings'; settings: TournamentSettings }
  | { type: 'configure-division'; divisionId: DivisionId; rules: DivisionRules }
  | { type: 'set-entry'; divisionId: 'unidos'; playerId: string; clubMember: boolean }
  | { type: 'remove-entry'; divisionId: 'unidos'; playerId: string }
  | { type: 'set-team'; divisionId: DivisionId; team: TournamentTeam }
  | { type: 'remove-team'; divisionId: DivisionId; teamId: string }
  | { type: 'lock-division'; divisionId: DivisionId }
  | { type: 'preview-draw'; divisionId: 'unidos' }
  | { type: 'confirm-draw'; divisionId: 'unidos'; drawId: string }
  | { type: 'discard-draw'; divisionId: 'unidos'; drawId: string }
  | { type: 'assign-court'; divisionId: DivisionId; matchId: string; courtId: string | null }
  | { type: 'start-match'; divisionId: DivisionId; matchId: string }
  | { type: 'record-result'; divisionId: DivisionId; matchId: string; result: MatchResult }
  | { type: 'correct-result'; divisionId: DivisionId; matchId: string; result: MatchResult; expectedResultId: string; reason: string; resolution?: QualifierResolution }
  | { type: 'withdraw'; divisionId: DivisionId; entryId: string; reason: string; resolution?: QualifierResolution }
  | { type: 'resolve-tie'; divisionId: DivisionId; tie: TieResolution; resolution?: QualifierResolution };

export interface TournamentEvent {
  v: 1;
  tournamentId: string;
  id: string;
  seq: number;
  ts: number;
  action: TournamentAction;
  initialRules?: Record<DivisionId, DivisionRules>;
  draw?: Draw;
  fixtures?: TournamentMatch[];
}

export type RankingMetric = 'wins' | 'head-to-head' | 'opponents-win-rate' | 'point-differential' | 'tie-playoff';

export interface RankingEvidence {
  metric: RankingMetric;
  value: number | null;
  matchIds: string[];
  reason: string;
}

export interface Standing {
  entryId: string;
  place: number;
  joint: boolean;
  provisional: boolean;
  withdrawn: boolean;
  wins: number;
  played: number;
  pointDifferential: number;
  scored: number;
  evidence: RankingEvidence[];
}

export interface DivisionStandings {
  groups: { pool: 'A' | 'B' | null; rows: Standing[] }[];
  provisional: boolean;
  championId: string | null;
  jointChampionIds: string[];
}

export interface RotationProgress {
  players: { playerId: string; played: number; scheduled: number; remaining: number }[];
  remainingGames: number;
  unfilledSlots: number;
  explanation: string[];
}
