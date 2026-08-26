import { useCallback, useMemo, useState } from 'react';
import { append, loadSession } from '../db/eventStore';
import { replay } from '../domain/reducer';
import { describeEvent, redoTarget, undoTarget, type CommandEvent } from '../domain/commands';
import type { SessionEvent, SessionState } from '../domain/types';

export interface SessionApi {
  events: SessionEvent[];
  state: SessionState;
  /** Append command events. Accepts null so callers can pass a command result directly. */
  dispatch: (commands: CommandEvent[] | null) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  undoLabel: string | null;
  canRedo: boolean;
  loadById: (sessionId: string) => Promise<void>;
  reset: () => void;
}

export function useSession(): SessionApi {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const state: SessionState = useMemo(() => replay(events), [events]);

  const dispatch = useCallback(async (commands: CommandEvent[] | null) => {
    if (!commands || commands.length === 0) {
      // a null command means the intent was refused (stale state, double tap); surface it in dev
      if (commands === null && import.meta.env.DEV) console.warn('upnext: command refused');
      return;
    }
    const appended: SessionEvent[] = [];
    for (const c of commands) appended.push(await append(c));
    setEvents((prev) => [...prev, ...appended]);
  }, []);

  const undoInfo = useMemo(() => {
    const target = undoTarget(events);
    if (!target) return null;
    const targetEvent = events.find((e) => e.id === target)!;
    return { target, label: describeEvent(targetEvent) };
  }, [events]);

  const undo = useCallback(async () => {
    const target = undoTarget(events);
    if (!target || !state.sessionId) return;
    await dispatch([{ type: 'event-undone', targetEventId: target, sessionId: state.sessionId }]);
  }, [events, state.sessionId, dispatch]);

  const redoId = useMemo(() => redoTarget(events), [events]);

  const redo = useCallback(async () => {
    if (!redoId || !state.sessionId) return;
    await dispatch([{ type: 'event-undone', targetEventId: redoId, sessionId: state.sessionId }]);
  }, [redoId, state.sessionId, dispatch]);

  const loadById = useCallback(async (sessionId: string) => {
    setEvents(await loadSession(sessionId));
  }, []);

  const reset = useCallback(() => setEvents([]), []);

  return {
    events,
    state,
    dispatch,
    undo,
    redo,
    undoLabel: undoInfo?.label ?? null,
    canRedo: redoId !== null,
    loadById,
    reset,
  };
}
