export type RuleTemplate = 'all-off' | 'winners-stay' | 'winners-split' | 'balanced' | 'social';

export const isWinnersTemplate = (t: RuleTemplate): boolean => t === 'winners-stay' || t === 'winners-split';

export interface RuleConfig {
  template: RuleTemplate;
  /** Consecutive wins before winners leave the court. Read by winners-stay (pair caps together) and winners-split (each winner caps individually). */
  winCap: number;
}

export type Pair = [string, string];
export type Pairs = [Pair, Pair];

export interface Player {
  id: string; // UUID, never autoincrement
  name: string;
  level?: string;
  /** 1 to 5 stars, absent = unrated. Balanced pairing treats unrated as 3. */
  rating?: number;
  createdAt: number;
  updatedAt: number;
}

/** Envelope carried by every event. */
export interface Envelope {
  id: string; // ULID
  sessionId: string; // UUID
  deviceId: string; // UUID per install
  seq: number; // per device, monotonically increasing
  ts: number; // wall clock ms
  v: 1; // event schema version
}

export type EventPayload =
  | { type: 'session-started'; courts: number; template: RuleTemplate; config: { winCap: number } }
  | { type: 'rule-changed'; template: RuleTemplate; config: { winCap: number } }
  | { type: 'player-checked-in'; playerId: string }
  | { type: 'player-departed'; playerId: string }
  | { type: 'player-sat-out'; playerId: string }
  | { type: 'player-returned'; playerId: string }
  | { type: 'game-started'; court: number; pairs: Pairs }
  | { type: 'game-lineup-changed'; court: number; pairs: Pairs }
  | { type: 'game-finished'; court: number; winnerPair?: 0 | 1; score?: string }
  | { type: 'court-closed'; court: number }
  | { type: 'court-reopened'; court: number }
  | { type: 'court-added' }
  | { type: 'event-undone'; targetEventId: string }
  | { type: 'session-ended' };

export type SessionEvent = Envelope & EventPayload;
export type EventType = EventPayload['type'];

export interface ActiveGame {
  court: number;
  pairs: Pairs;
  startedAt: number; // ts of the game-started event; timers derive from this
  startedEventId: string;
}

export interface FinishedGame {
  court: number;
  pairs: Pairs;
  winnerPair?: 0 | 1;
  score?: string;
  startedAt: number;
  endedAt: number;
}

export interface SessionState {
  sessionId: string | null;
  started: boolean;
  ended: boolean;
  startedAt: number;
  endedAt: number | null;
  courtCount: number;
  rule: RuleConfig;
  /** Player ids in check-in order. Grows only; departures are tracked in departed, not removed here. */
  checkedIn: string[];
  sittingOut: string[];
  departed: string[];
  /** Waiting order. Front of array is next up. Sitting-out players stay in place. */
  queue: string[];
  /** Active game per court number. Absent key = empty court. */
  games: Record<number, ActiveGame>;
  closedCourts: number[];
  gamesPlayed: Record<string, number>;
  wins: Record<string, number>;
  /** Consecutive wins on court right now, for the win cap. Reset when a player leaves the court. */
  consecutiveWins: Record<string, number>;
  finishedGames: FinishedGame[];
  /** Incremented on every non-winners finish. Kept for event compatibility; pairing rotation now derives from games played together. */
  pairingCycle: number;
}

export function emptyState(): SessionState {
  return {
    sessionId: null,
    started: false,
    ended: false,
    startedAt: 0,
    endedAt: null,
    courtCount: 0,
    rule: { template: 'all-off', winCap: 3 },
    checkedIn: [],
    sittingOut: [],
    departed: [],
    queue: [],
    games: {},
    closedCourts: [],
    gamesPlayed: {},
    wins: {},
    consecutiveWins: {},
    finishedGames: [],
    pairingCycle: 0,
  };
}
