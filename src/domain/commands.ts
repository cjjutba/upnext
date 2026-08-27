import type { EventPayload, Pairs, RuleTemplate, SessionEvent, SessionState } from './types';
import { emptyState, isWinnersTemplate } from './types';
import { applyEvent, computeSkipped, isPlaying } from './reducer';
import { nextLineup, type LastFinished, type Ratings } from './templates';

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
 * game-started events for every fillable court. When a court just finished,
 * it fills FIRST and is the only court that sees lastFinished, so template
 * winner priority applies to the court the winners actually won on, never to
 * whichever empty court happens to be numbered lowest.
 */
function fillEvents(
  state: SessionState, lastFinished: LastFinished | null = null, onCourt?: number, ratings: Ratings = {},
): CommandEvent[] {
  const out: CommandEvent[] = [];
  let s = state;
  const courts = Array.from({ length: s.courtCount }, (_, i) => i + 1);
  const order = onCourt === undefined ? courts : [onCourt, ...courts.filter((c) => c !== onCourt)];
  for (const court of order) {
    if (s.games[court] || s.closedCourts.includes(court)) continue;
    const pairs = nextLineup(s, court === onCourt ? lastFinished : null, ratings);
    if (!pairs) break;
    const e: CommandEvent = { type: 'game-started', court, pairs, sessionId: s.sessionId! };
    out.push(e);
    s = simulate(s, e);
  }
  return out;
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
  return [...events, ...fillEvents(s, null, undefined, ratings)];
}

export function finishGame(state: SessionState, court: number, winnerPair?: 0 | 1, ratings: Ratings = {}): CommandEvent[] | null {
  const active = state.games[court];
  if (!active || !state.sessionId || state.ended) return null;
  const needsWinner = isWinnersTemplate(state.rule.template);
  if (needsWinner && winnerPair === undefined) return null;
  const e: CommandEvent = {
    type: 'game-finished', court, winnerPair: needsWinner ? winnerPair : undefined, sessionId: state.sessionId,
  };
  const after = simulate(state, e);
  return [e, ...fillEvents(after, { pairs: active.pairs, winnerPair: e.winnerPair }, court, ratings)];
}

export function checkInPlayer(state: SessionState, playerId: string, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.ended) return null;
  if (state.queue.includes(playerId) || isPlaying(state, playerId)) return null;
  const e: CommandEvent = { type: 'player-checked-in', playerId, sessionId: state.sessionId };
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function departPlayer(state: SessionState, playerId: string): CommandEvent[] | null {
  if (!state.sessionId || !state.queue.includes(playerId)) return null;
  return [{ type: 'player-departed', playerId, sessionId: state.sessionId }];
}

export function sitOutPlayer(state: SessionState, playerId: string): CommandEvent[] | null {
  if (!state.sessionId || !state.queue.includes(playerId) || state.sittingOut.includes(playerId)) return null;
  return [{ type: 'player-sat-out', playerId, sessionId: state.sessionId }];
}

export function returnPlayer(state: SessionState, playerId: string, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.sittingOut.includes(playerId)) return null;
  const e: CommandEvent = { type: 'player-returned', playerId, sessionId: state.sessionId };
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function closeCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.closedCourts.includes(court)) return null;
  const e: CommandEvent = { type: 'court-closed', court, sessionId: state.sessionId };
  // closing frees four players, other courts may now fill
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function reopenCourt(state: SessionState, court: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.closedCourts.includes(court)) return null;
  const e: CommandEvent = { type: 'court-reopened', court, sessionId: state.sessionId };
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function addCourt(state: SessionState, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || !state.started || state.ended) return null;
  const e: CommandEvent = { type: 'court-added', sessionId: state.sessionId };
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function changeRule(state: SessionState, template: RuleTemplate, winCap: number, ratings: Ratings = {}): CommandEvent[] | null {
  if (!state.sessionId || state.ended) return null;
  if (template === state.rule.template && winCap === state.rule.winCap) return null;
  const e: CommandEvent = { type: 'rule-changed', template, config: { winCap }, sessionId: state.sessionId };
  // defensive: every capacity increasing command already fills eagerly, so this is normally a no-op
  return [e, ...fillEvents(simulate(state, e), null, undefined, ratings)];
}

export function changeLineup(state: SessionState, court: number, pairs: Pairs): CommandEvent[] | null {
  if (!state.sessionId || !state.games[court]) return null;
  return [{ type: 'game-lineup-changed', court, pairs, sessionId: state.sessionId }];
}

export function endSession(state: SessionState): CommandEvent[] | null {
  if (!state.sessionId || !state.started || state.ended) return null;
  return [{ type: 'session-ended', sessionId: state.sessionId }];
}

/** Sequential undo: the newest effective action. session-started is never undoable. */
export function undoTarget(events: SessionEvent[]): string | null {
  const skipped = computeSkipped(events);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'event-undone' || skipped.has(e.id)) continue;
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
    case 'game-finished': return `Undo: court ${e.court} finished`;
    case 'game-started': return `Undo: court ${e.court} filled`;
    case 'game-lineup-changed': return `Undo: court ${e.court} lineup`;
    case 'player-checked-in': return 'Undo: check-in';
    case 'player-departed': return 'Undo: departure';
    case 'player-sat-out': return 'Undo: sit out';
    case 'player-returned': return 'Undo: return';
    case 'court-closed': return `Undo: court ${e.court} closed`;
    case 'court-reopened': return `Undo: court ${e.court} reopened`;
    case 'court-added': return 'Undo: court added';
    case 'rule-changed': return 'Undo: rule change';
    case 'session-ended': return 'Undo: end session';
    default: return 'Undo';
  }
}
