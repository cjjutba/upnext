export type RuleTemplate = 'all-off' | 'winners-stay' | 'winners-split' | 'balanced' | 'social';

export const isWinnersTemplate = (t: RuleTemplate): boolean => t === 'winners-stay' || t === 'winners-split';

export interface RuleConfig {
  template: RuleTemplate;
  /** Consecutive wins before winners leave the court. Read by winners-stay (pair caps together) and winners-split (each winner caps individually). */
  winCap: number;
}

export type Pair = [string, string];
export type Pairs = [Pair, Pair];

/** A seat on a court. null is an open seat the organizer has not filled yet. */
export type Slot = string | null;
export type SlotPair = [Slot, Slot];
/** A live court's four seats, any of which may be open. Pairs is assignable to it. */
export type Lineup = [SlotPair, SlotPair];

/** Slot order everywhere: 0 and 1 are team 1, 2 and 3 are team 2. */
export type SlotIndex = 0 | 1 | 2 | 3;

export const slotAt = (l: Lineup, i: SlotIndex): Slot => l[i < 2 ? 0 : 1][i % 2];

export function withSlot(l: Lineup, i: SlotIndex, value: Slot): Lineup {
  const out: Lineup = [[l[0][0], l[0][1]], [l[1][0], l[1][1]]];
  out[i < 2 ? 0 : 1][i % 2] = value;
  return out;
}

/** The players actually on court, in slot order. Open seats drop out. */
export const seated = (l: Lineup): string[] =>
  [l[0][0], l[0][1], l[1][0], l[1][1]].filter((p): p is string => p !== null);

/** Narrows a full court back to Pairs. null when any seat is empty. */
export function fullLineup(l: Lineup): Pairs | null {
  const [a, b, c, d] = [l[0][0], l[0][1], l[1][0], l[1][1]];
  return a !== null && b !== null && c !== null && d !== null ? [[a, b], [c, d]] : null;
}

/** The court numbers in service. The board draws these, and the queue previews are capped by how many there are. */
export function openCourts(state: SessionState): number[] {
  return Array.from({ length: state.courtCount }, (_, i) => i + 1)
    .filter((n) => !state.closedCourts.includes(n));
}

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
  /** Four assigned to a court, clock not running. `auto` marks a fill a command emitted, which is what undo skips over. */
  | { type: 'game-staged'; court: number; pairs: Pairs; auto?: true }
  | { type: 'game-unstaged'; court: number }
  | { type: 'queue-swapped'; playerA: string; playerB: string }
  /** Only a live court can go short handed, so this is the one payload that carries an open seat. */
  | { type: 'game-lineup-changed'; court: number; pairs: Lineup }
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
  /** May hold an open seat. A short handed court keeps its timer and cannot record a winner. */
  pairs: Lineup;
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
  /**
   * Four waiting on a court for the organizer to start them. Kept out of games so
   * nothing that reads games has to ask whether the clock is running. Always a full
   * four: a staged court that is wrong gets unstaged, only a live one goes short handed.
   */
  staged: Record<number, Pairs>;
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
    staged: {},
    closedCourts: [],
    gamesPlayed: {},
    wins: {},
    consecutiveWins: {},
    finishedGames: [],
    pairingCycle: 0,
  };
}
