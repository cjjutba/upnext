import { useCallback, useMemo, useRef, useState } from 'react';
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

  /**
   * Every log mutation runs through one promise queue. Without it, two fast
   * taps can merge events into memory in an order that differs from the
   * canonical ULID order a reload replays, and a double tap on undo can
   * target the same event twice, which breaks the redo chain.
   */
  const logRef = useRef<SessionEvent[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueue = useCallback((job: () => Promise<void>): Promise<void> => {
    const run = queueRef.current.then(job, job);
    queueRef.current = run;
    return run;
  }, []);

  const appendCommands = useCallback(async (commands: CommandEvent[] | null) => {
    if (!commands || commands.length === 0) {
      // a null command means the intent was refused (stale state, double tap); surface it in dev
      if (commands === null && import.meta.env.DEV) console.warn('upnext: command refused');
      return;
    }
    const appended: SessionEvent[] = [];
    for (const c of commands) appended.push(await append(c));
    logRef.current = [...logRef.current, ...appended];
    setEvents(logRef.current);
  }, []);

  const dispatch = useCallback(
    (commands: CommandEvent[] | null) => enqueue(() => appendCommands(commands)),
    [enqueue, appendCommands],
  );

  const undo = useCallback(
    () =>
      enqueue(async () => {
        const log = logRef.current;
        const target = undoTarget(log);
        const sessionId = log[0]?.sessionId;
        if (!target || !sessionId) return;
        await appendCommands([{ type: 'event-undone', targetEventId: target, sessionId }]);
      }),
    [enqueue, appendCommands],
  );

  const redo = useCallback(
    () =>
      enqueue(async () => {
        const log = logRef.current;
        const target = redoTarget(log);
        const sessionId = log[0]?.sessionId;
        if (!target || !sessionId) return;
        await appendCommands([{ type: 'event-undone', targetEventId: target, sessionId }]);
      }),
    [enqueue, appendCommands],
  );

  const undoInfo = useMemo(() => {
    const target = undoTarget(events);
    if (!target) return null;
    const targetEvent = events.find((e) => e.id === target)!;
    return { target, label: describeEvent(targetEvent) };
  }, [events]);

  const redoId = useMemo(() => redoTarget(events), [events]);

  const loadById = useCallback(
    (sessionId: string) =>
      enqueue(async () => {
        logRef.current = await loadSession(sessionId);
        setEvents(logRef.current);
      }),
    [enqueue],
  );

  const reset = useCallback(() => {
    void enqueue(async () => {
      logRef.current = [];
      setEvents([]);
    });
  }, [enqueue]);

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
