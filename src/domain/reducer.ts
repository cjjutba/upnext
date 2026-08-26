import type { Pairs, SessionEvent, SessionState } from './types';
import { emptyState } from './types';

const lineupPlayers = (pairs: Pairs): string[] => [pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]];
const without = (arr: string[], remove: string[]): string[] => arr.filter((x) => !remove.includes(x));
const resetAll = (rec: Record<string, number>, players: string[]): Record<string, number> => {
  const out = { ...rec };
  for (const p of players) out[p] = 0;
  return out;
};
const bumpAll = (rec: Record<string, number>, players: string[]): Record<string, number> => {
  const out = { ...rec };
  for (const p of players) out[p] = (out[p] ?? 0) + 1;
  return out;
};

/**
 * Which events are skipped. An event is skipped when a non skipped event-undone
 * targets it. An event-undone targeting an event-undone reinstates the original.
 */
export function computeSkipped(events: SessionEvent[]): Set<string> {
  const undosByTarget = new Map<string, SessionEvent[]>();
  for (const e of events) {
    if (e.type === 'event-undone') {
      const list = undosByTarget.get(e.targetEventId) ?? [];
      list.push(e);
      undosByTarget.set(e.targetEventId, list);
    }
  }
  const memo = new Map<string, boolean>();
  const isSkipped = (id: string): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    memo.set(id, false); // guard against malformed cycles
    const skipped = (undosByTarget.get(id) ?? []).some((u) => !isSkipped(u.id));
    memo.set(id, skipped);
    return skipped;
  };
  const out = new Set<string>();
  for (const e of events) if (isSkipped(e.id)) out.add(e.id);
  return out;
}

/** Replay is the only way to get state. Events must be in canonical order (id ascending). */
export function replay(events: SessionEvent[]): SessionState {
  const skipped = computeSkipped(events);
  let state = emptyState();
  for (const e of events) {
    if (skipped.has(e.id) || e.type === 'event-undone') continue;
    state = applyEvent(state, e);
  }
  return state;
}

/** Pure transition. Invalid events return state unchanged so foreign logs cannot crash replay. */
export function applyEvent(state: SessionState, e: SessionEvent): SessionState {
  switch (e.type) {
    case 'session-started': {
      if (state.started) return state;
      return {
        ...emptyState(),
        sessionId: e.sessionId,
        started: true,
        startedAt: e.ts,
        courtCount: e.courts,
        rule: { template: e.template, winCap: e.config.winCap },
      };
    }
    case 'rule-changed': {
      if (!state.started || state.ended) return state;
      return { ...state, rule: { template: e.template, winCap: e.config.winCap } };
    }
    case 'player-checked-in': {
      if (!state.started || state.ended) return state;
      if (state.queue.includes(e.playerId) || isPlaying(state, e.playerId)) return state;
      return {
        ...state,
        checkedIn: state.checkedIn.includes(e.playerId) ? state.checkedIn : [...state.checkedIn, e.playerId],
        departed: state.departed.filter((p) => p !== e.playerId),
        sittingOut: state.sittingOut.filter((p) => p !== e.playerId),
        queue: [...state.queue, e.playerId],
      };
    }
    case 'player-departed': {
      if (!state.queue.includes(e.playerId)) return state; // cannot depart mid game or twice
      return {
        ...state,
        queue: state.queue.filter((p) => p !== e.playerId),
        sittingOut: state.sittingOut.filter((p) => p !== e.playerId),
        departed: [...state.departed, e.playerId],
        consecutiveWins: { ...state.consecutiveWins, [e.playerId]: 0 },
      };
    }
    case 'player-sat-out': {
      if (!state.queue.includes(e.playerId) || state.sittingOut.includes(e.playerId)) return state;
      return { ...state, sittingOut: [...state.sittingOut, e.playerId] };
    }
    case 'player-returned': {
      if (!state.sittingOut.includes(e.playerId)) return state;
      return { ...state, sittingOut: state.sittingOut.filter((p) => p !== e.playerId) };
    }
    case 'game-started': {
      const players = lineupPlayers(e.pairs);
      if (!state.started || state.ended) return state;
      if (state.games[e.court] || state.closedCourts.includes(e.court)) return state;
      if (e.court < 1 || e.court > state.courtCount) return state;
      if (new Set(players).size !== 4) return state;
      if (!players.every((p) => state.queue.includes(p) && !state.sittingOut.includes(p))) return state;
      return {
        ...state,
        queue: without(state.queue, players),
        games: {
          ...state.games,
          [e.court]: { court: e.court, pairs: e.pairs, startedAt: e.ts, startedEventId: e.id },
        },
      };
    }
    case 'game-lineup-changed': {
      const active = state.games[e.court];
      if (!active) return state;
      const before = lineupPlayers(active.pairs);
      const after = lineupPlayers(e.pairs);
      if (new Set(after).size !== 4) return state;
      const added = after.filter((p) => !before.includes(p));
      const removed = before.filter((p) => !after.includes(p));
      if (!added.every((p) => state.queue.includes(p) && !state.sittingOut.includes(p))) return state;
      return {
        ...state,
        queue: [...removed, ...without(state.queue, added)], // replaced players go to the front
        games: { ...state.games, [e.court]: { ...active, pairs: e.pairs } },
      };
    }
    case 'game-finished': {
      const active = state.games[e.court];
      if (!active) return state;
      // imported logs are untyped at runtime: an out of range winnerPair must no-op, never crash replay
      if (e.winnerPair !== undefined && e.winnerPair !== 0 && e.winnerPair !== 1) return state;
      const players = lineupPlayers(active.pairs);
      const games = { ...state.games };
      delete games[e.court];
      const finished = {
        court: e.court,
        pairs: active.pairs,
        winnerPair: e.winnerPair,
        score: e.score,
        startedAt: active.startedAt,
        endedAt: e.ts,
      };
      const base: SessionState = {
        ...state,
        games,
        gamesPlayed: bumpAll(state.gamesPlayed, players),
        finishedGames: [...state.finishedGames, finished],
      };
      const rule = state.rule;
      const winnersMode = rule.template === 'winners-stay' || rule.template === 'winners-split';
      if (!winnersMode || e.winnerPair === undefined) {
        return {
          ...base,
          queue: [...state.queue, ...players],
          consecutiveWins: resetAll(state.consecutiveWins, players),
          pairingCycle: state.pairingCycle + 1,
        };
      }
      const winners = active.pairs[e.winnerPair];
      const losers = active.pairs[e.winnerPair === 0 ? 1 : 0];
      const wins = bumpAll(state.wins, [...winners]);
      const streak = (p: string) => (state.consecutiveWins[p] ?? 0) + 1;
      // queue placement order below is load bearing: templates infer who kept the court from the queue front
      if (rule.template === 'winners-stay') {
        const capped = winners.some((w) => streak(w) >= rule.winCap);
        if (capped) {
          return {
            ...base,
            wins,
            queue: [...state.queue, ...losers, ...winners],
            consecutiveWins: resetAll(state.consecutiveWins, players),
          };
        }
        let cw = resetAll(state.consecutiveWins, [...losers]);
        for (const w of winners) cw[w] = streak(w);
        return { ...base, wins, queue: [...winners, ...state.queue, ...losers], consecutiveWins: cw };
      }
      // winners-split: each winner caps individually
      const stayers = winners.filter((w) => streak(w) < rule.winCap);
      const cappedOut = winners.filter((w) => streak(w) >= rule.winCap);
      let cw = resetAll(state.consecutiveWins, [...losers, ...cappedOut]);
      for (const w of stayers) cw[w] = streak(w);
      return {
        ...base,
        wins,
        queue: [...stayers, ...state.queue, ...losers, ...cappedOut],
        consecutiveWins: cw,
      };
    }
    case 'court-closed': {
      if (state.closedCourts.includes(e.court)) return state;
      if (e.court < 1 || e.court > state.courtCount) return state;
      const active = state.games[e.court];
      const games = { ...state.games };
      delete games[e.court];
      const players = active ? lineupPlayers(active.pairs) : [];
      return {
        ...state,
        games,
        queue: active ? [...players, ...state.queue] : state.queue, // mid game players go to the front
        consecutiveWins: resetAll(state.consecutiveWins, players),
        closedCourts: [...state.closedCourts, e.court],
      };
    }
    case 'court-reopened': {
      if (!state.closedCourts.includes(e.court)) return state;
      return { ...state, closedCourts: state.closedCourts.filter((c) => c !== e.court) };
    }
    case 'court-added': {
      if (!state.started || state.ended) return state;
      return { ...state, courtCount: state.courtCount + 1 };
    }
    case 'session-ended': {
      if (!state.started || state.ended) return state;
      return { ...state, ended: true, endedAt: e.ts };
    }
    case 'event-undone':
      return state; // handled by replay via computeSkipped
    default:
      return state;
  }
}

export function isPlaying(state: SessionState, playerId: string): boolean {
  return Object.values(state.games).some((g) => lineupPlayers(g.pairs).includes(playerId));
}
