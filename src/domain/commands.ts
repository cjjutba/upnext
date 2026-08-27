import type { EventPayload, Lineup, Pairs, RuleTemplate, SessionEvent, SessionState, SlotIndex } from './types';
import { emptyState, fullLineup, isWinnersTemplate, slotAt, withSlot } from './types';
import { applyEvent, computeSkipped, isPlaying, isStaged, stagedCourtOf } from './reducer';
import { nextLineup, type LastFinished, type Ratings } from './templates';
import { modeLabel } from './modes';

/** A command's output: payload plus sessionId. The event store fills the envelope. */
export type CommandEvent = EventPayload & { sessionId: string };

// module level counter is a deliberate impurity: sim envelopes never leave this module, so it is unobservable in output
let simCounter = 0;
/** Simulate applying a not yet persisted event. Sim envelopes never leave this module. */
function simulate(state: SessionState, e: CommandEvent): SessionState {
  simCounter += 1;
  return applyEvent(state, { ...e, id: `sim-${simCounter}`, deviceId: 'sim', seq: 0, ts: Date.now(), v: 1 } as SessionEvent);
}

/**
 * game-staged events for every stageable court. The four walk on, the clock
 * waits for the organizer. When a court just finished, it stages FIRST and is
 * the only court that sees lastFinished, so template winner priority applies
 * to the court the winners actually won on, never to whichever empty court
 * happens to be numbered lowest.
 */
function stageEvents(
  state: SessionState, lastFinished: LastFinished | null = null, onCourt?: number, ratings: Ratings = {},
): CommandEvent[] {
  const out: CommandEvent[] = [];
  let s = state;
  const courts = Array.from({ length: s.courtCount }, (_, i) => i + 1);
  const order = onCourt === undefined ? courts : [onCourt, ...courts.filter((c) => c !== onCourt)];
  for (const court of order) {
    if (s.games[court] || s.staged[court] || s.closedCourts.includes(court)) continue;
    const pairs = nextLineup(s, court === onCourt ? lastFinished : null, ratings);
    if (!pairs) break;
    const e: CommandEvent = { type: 'game-staged', court, pairs, auto: true, sessionId: s.sessionId! };
    out.push(e);
    s = simulate(s, e);
  }
  return out;
}

const lineupOf = (pairs: Pairs): string[] => [pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]];

/** Same four positions, one name changed. Null when the outgoing player is not on this court. */
function replaceInPairs(pairs: Pairs, outId: string, inId: string): Pairs | null {
  if (!lineupOf(pairs).includes(outId)) return null;
  return pairs.map((pair) => pair.map((p) => (p === outId ? inId : p))) as Pairs;
}

/** Front of the queue, skipping anyone sitting out. Staged players are already out of the queue. */
const firstWaiting = (state: SessionState): string | undefined =>
  state.queue.find((p) => !state.sittingOut.includes(p));

/**
 * Get a staged player back into the queue, which is where player-departed and
 * player-sat-out both require them to be. Their slot goes to whoever is next
 * up, or the whole court clears when nobody is waiting.
 */
function releaseStaged(state: SessionState, playerId: string): CommandEvent[] {
  const court = stagedCourtOf(state, playerId);
  if (court === null) return [];
  const pairs = state.staged[court];
  const replacement = firstWaiting(state);
  const swapped = replacement ? replaceInPairs(pairs, playerId, replacement) : null;
  return swapped
    ? [{ type: 'game-staged', court, pairs: swapped, sessionId: state.sessionId! }]
    : [{ type: 'game-unstaged', court, sessionId: state.sessionId! }];
}

export interface SessionConfig {
  courts: number;
  template: RuleTemplate;
  winCap: number;
}

export function startSession(config: SessionConfig, playerIds: string[], ratings: Ratings = {}): CommandEvent[] {
  const sessionId = crypto.randomUUID();
  const events: CommandEvent[] = [
    { type: 'session-started', courts: config.courts, template: config.template, config: { winCap: config.winCap }, sessionId },
  ];
  let s = simulate(emptyState(), events[0]);
  for (const playerId of playerIds) {
    const e: CommandEvent = { type: 'player-checked-in', playerId, sessionId };
    events.push(e);
    s = simulate(s, e);
  }
  return [...events, ...stageEvents(s, null, undefined, ratings)];
}

export function finishGame(state: SessionState, court: number, winnerPair?: 0 | 1, ratings: Ratings = {}, score?: string): CommandEvent[] | null {
  const active = state.games[court];
  if (!active || !state.sessionId || state.ended) return null;
  // an open seat means this was never a game of four, so there is nothing to record
  const lineup = fullLineup(active.pairs);
  if (!lineup) return null;
  // Winners templates cannot rotate without a winner; every other mode records one when the organizer taps it and shrugs when they do not.
  if (isWinnersTemplate(state.rule.template) && winnerPair === undefined) return null;
  // score is absent rather than undefined so exported JSON never carries empty keys
  const e: CommandEvent = score
    ? { type: 'game-finished', court, winnerPair, score, sessionId: state.sessionId }
    : { type: 'game-finished', court, winnerPair, sessionId: state.sessionId };
  const after = simulate(state, e);
  return [e, ...stageEvents(after, { pairs: lineup, winnerPair: e.winnerPair }, court, ratings)];
}

export function checkInPlayer(state: SessionState, playerId: string, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.ended) return null;
  if (state.queue.includes(playerId) || isPlaying(state, playerId)) return null;
  const e: CommandEvent = { type: 'player-checked-in', playerId, sessionId: state.sessionId };
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

export function departPlayer(state: SessionState, playerId: string): CommandEvent[] | null {
  if (!state.sessionId) return null;
  const release = releaseStaged(state, playerId);
  const after = release.reduce(simulate, state);
  if (!after.queue.includes(playerId)) return null; // mid game, already gone, or never here
  return [...release, { type: 'player-departed', playerId, sessionId: state.sessionId }];
}

export function sitOutPlayer(state: SessionState, playerId: string): CommandEvent[] | null {
  if (!state.sessionId) return null;
  const release = releaseStaged(state, playerId);
  const after = release.reduce(simulate, state);
  if (!after.queue.includes(playerId) || after.sittingOut.includes(playerId)) return null;
  return [...release, { type: 'player-sat-out', playerId, sessionId: state.sessionId }];
}

export function returnPlayer(state: SessionState, playerId: string, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.sittingOut.includes(playerId)) return null;
  const e: CommandEvent = { type: 'player-returned', playerId, sessionId: state.sessionId };
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

export function closeCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.closedCourts.includes(court)) return null;
  const e: CommandEvent = { type: 'court-closed', court, sessionId: state.sessionId };
  // closing frees four players, other courts may now fill
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

export function reopenCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.closedCourts.includes(court)) return null;
  const e: CommandEvent = { type: 'court-reopened', court, sessionId: state.sessionId };
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

export function addCourt(state: SessionState, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.started || state.ended) return null;
  // a closed court gave its number back, so hand the lowest of those out before numbering a new one
  const reusable = Array.from({ length: state.courtCount }, (_, i) => i + 1)
    .find((c) => state.closedCourts.includes(c));
  if (reusable !== undefined) return reopenCourt(state, reusable, ratings);
  const e: CommandEvent = { type: 'court-added', sessionId: state.sessionId };
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

export function changeRule(state: SessionState, template: RuleTemplate, winCap: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.ended) return null;
  if (template === state.rule.template && winCap === state.rule.winCap) return null;
  const e: CommandEvent = { type: 'rule-changed', template, config: { winCap }, sessionId: state.sessionId };
  // defensive: every capacity increasing command already fills eagerly, so this is normally a no-op
  return [e, ...stageEvents(simulate(state, e), null, undefined, ratings)];
}

/** Tap Start: the staged four go live and the clock begins. */
export function startStagedGame(state: SessionState, court: number): CommandEvent[] | null {
  const pairs = state.staged[court];
  if (!state.sessionId || state.ended || !pairs || state.games[court]) return null;
  return [{ type: 'game-started', court, pairs, sessionId: state.sessionId }];
}

/** Put the next four on an empty court by hand. The escape hatch after an unstage. */
export function stageCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.started || state.ended) return null;
  if (court < 1 || court > state.courtCount) return null;
  if (state.games[court] || state.staged[court] || state.closedCourts.includes(court)) return null;
  const pairs = nextLineup(state, null, ratings);
  if (!pairs) return null;
  return [{ type: 'game-staged', court, pairs, sessionId: state.sessionId }];
}

/** Send a staged four back to the front of the queue. */
export function unstageCourt(state: SessionState, court: number): CommandEvent[] | null {
  if (!state.sessionId || !state.staged[court]) return null;
  return [{ type: 'game-unstaged', court, sessionId: state.sessionId }];
}

/**
 * Apply a hand-composed lineup to a court. One call for both phases: a staged
 * court restages, a live one takes a lineup change. The reducer owns the
 * guards on who may join, so this only refuses a court that holds nothing.
 */
export function setLineup(state: SessionState, court: number, pairs: Pairs): CommandEvent[] | null {
  if (!state.sessionId || state.ended) return null;
  if (state.staged[court]) return [{ type: 'game-staged', court, pairs, sessionId: state.sessionId }];
  if (state.games[court]) return [{ type: 'game-lineup-changed', court, pairs, sessionId: state.sessionId }];
  return null;
}

/**
 * Swap one waiting player onto a court in place of one who is on it, keeping
 * the pairing.
 */
export function substitutePlayer(state: SessionState, court: number, outId: string, inId: string): CommandEvent[] | null {
  if (!state.sessionId || state.ended || outId === inId) return null;
  if (!state.queue.includes(inId) || state.sittingOut.includes(inId)) return null;
  const pairs = state.staged[court] ?? state.games[court]?.pairs;
  if (!pairs) return null;
  const next = replaceInPairs(pairs, outId, inId);
  if (!next) return null;
  return setLineup(state, court, next);
}

/**
 * The next of the three partitions of the staged four. Anchored on the sorted
 * ids rather than current positions, so repeated taps cycle all three instead
 * of flipping between two.
 */
export function shufflePairing(state: SessionState, court: number): CommandEvent[] | null {
  const pairs = state.staged[court];
  if (!state.sessionId || state.ended || !pairs) return null;
  const [a, b, c, d] = lineupOf(pairs).slice().sort();
  const opts: Pairs[] = [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
  const key = (x: Pairs) => x.map((pair) => [...pair].sort().join('|')).sort().join(' vs ');
  const i = opts.findIndex((o) => key(o) === key(pairs));
  return [{ type: 'game-staged', court, pairs: opts[(i + 1) % 3], sessionId: state.sessionId }];
}

/** Exchange two waiting positions, which is how the queue previews get edited. */
export function swapQueue(state: SessionState, playerA: string, playerB: string): CommandEvent[] | null {
  if (!state.sessionId || state.ended || playerA === playerB) return null;
  if (!state.queue.includes(playerA) || !state.queue.includes(playerB)) return null;
  return [{ type: 'queue-swapped', playerA, playerB, sessionId: state.sessionId }];
}

export function changeLineup(state: SessionState, court: number, pairs: Lineup): CommandEvent[] | null {
  if (!state.sessionId || !state.games[court]) return null;
  return [{ type: 'game-lineup-changed', court, pairs, sessionId: state.sessionId }];
}

const SLOTS: SlotIndex[] = [0, 1, 2, 3];

/** Lift one player off a court. The seat stays open until somebody fills it. */
export function removeFromLineup(state: SessionState, court: number, slot: SlotIndex): CommandEvent[] | null {
  const active = state.games[court];
  if (!state.sessionId || !active || slotAt(active.pairs, slot) === null) return null;
  // no trailing fill on purpose. The removed player goes to the queue front, and an eager
  // refill would drop them straight onto another court, which is not what a remove means
  return [{ type: 'game-lineup-changed', court, pairs: withSlot(active.pairs, slot, null), sessionId: state.sessionId }];
}

/**
 * Put a specific player in a specific seat, checking them in or bringing them
 * back from sitting out first. Whoever held the seat goes to the queue front.
 */
export function seatPlayer(
  state: SessionState, court: number, slot: SlotIndex, playerId: string, ratings: Ratings = {},
): CommandEvent[] | null {
  if (!state.sessionId || state.ended || !state.games[court]) return null;
  // staged players are out of the queue, so checking one in here would put them in two places at once
  if (isPlaying(state, playerId) || isStaged(state, playerId)) return null;
  const out: CommandEvent[] = [];
  let s = state;
  const push = (e: CommandEvent) => {
    out.push(e);
    s = simulate(s, e);
  };
  if (s.sittingOut.includes(playerId)) push({ type: 'player-returned', playerId, sessionId: s.sessionId! });
  else if (!s.queue.includes(playerId)) push({ type: 'player-checked-in', playerId, sessionId: s.sessionId! });
  const active = s.games[court];
  if (!active || !s.queue.includes(playerId)) return null;
  push({ type: 'game-lineup-changed', court, pairs: withSlot(active.pairs, slot, playerId), sessionId: s.sessionId! });
  // a check-in or a return adds a body to the pool, which can unblock a different court
  return [...out, ...stageEvents(s, null, undefined, ratings)];
}

/**
 * Fill the open seats on a live court from the front of the queue. An empty
 * court is `stageCourt`'s job, and a staged one is never short handed.
 */
export function fillCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.ended || state.closedCourts.includes(court)) return null;
  if (court < 1 || court > state.courtCount) return null;
  const active = state.games[court];
  if (!active) return null;
  const open = SLOTS.filter((i) => slotAt(active.pairs, i) === null);
  const waiting = state.queue.filter((p) => !state.sittingOut.includes(p));
  if (open.length === 0 || waiting.length === 0) return null;
  // a court with all four seats open is a fresh fill, so the mode picks the pairing
  const fresh = open.length === 4 ? nextLineup(state, null, ratings) : null;
  if (fresh) return [{ type: 'game-lineup-changed', court, pairs: fresh, sessionId: state.sessionId }];
  let pairs: Lineup = active.pairs;
  for (let i = 0; i < open.length && i < waiting.length; i += 1) pairs = withSlot(pairs, open[i], waiting[i]);
  return [{ type: 'game-lineup-changed', court, pairs, sessionId: state.sessionId }];
}

export function endSession(state: SessionState): CommandEvent[] | null {
  if (!state.sessionId || !state.started || state.ended) return null;
  return [{ type: 'session-ended', sessionId: state.sessionId }];
}

/**
 * Sequential undo: the newest effective action. session-started is never undoable.
 * Auto stages are never targeted directly: undoing the action that caused one
 * invalidates it on replay (players not in queue), so one undo reverts the whole
 * batch, e.g. a team win plus the stage it triggered. A start is a deliberate tap,
 * so it stays undoable and puts the court back to staged.
 */
export function undoTarget(events: SessionEvent[]): string | null {
  const skipped = computeSkipped(events);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'event-undone' || (e.type === 'game-staged' && e.auto) || skipped.has(e.id)) continue;
    if (e.type === 'session-started') return null;
    return e.id;
  }
  return null;
}

/** Redo: the newest effective event-undone, unless a newer effective action exists. */
export function redoTarget(events: SessionEvent[]): string | null {
  const skipped = computeSkipped(events);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (skipped.has(e.id)) continue;
    if (e.type === 'event-undone') return e.id;
    if (e.type !== 'session-started') return null;
  }
  return null;
}

/** Label for the undo pill. */
export function describeEvent(e: SessionEvent): string {
  switch (e.type) {
    case 'game-finished':
      return e.winnerPair === undefined ? `Undo: court ${e.court} finished` : `Undo: court ${e.court}, team ${e.winnerPair + 1} won`;
    case 'game-started': return `Undo: court ${e.court} started`;
    case 'game-staged': return `Undo: court ${e.court} lineup`;
    case 'game-unstaged': return `Undo: court ${e.court} cleared`;
    case 'queue-swapped': return 'Undo: queue order';
    case 'game-lineup-changed': return `Undo: court ${e.court} lineup`;
    case 'player-checked-in': return 'Undo: check-in';
    case 'player-departed': return 'Undo: departure';
    case 'player-sat-out': return 'Undo: sit out';
    case 'player-returned': return 'Undo: return';
    case 'court-closed': return `Undo: court ${e.court} closed`;
    case 'court-reopened': return `Undo: court ${e.court} reopened`;
    case 'court-added': return 'Undo: court added';
    case 'rule-changed': return `Undo: ${modeLabel(e.template)} mode`;
    case 'session-ended': return 'Undo: end session';
    default: return 'Undo';
  }
}
