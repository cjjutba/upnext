import { useEffect, useState } from 'react';
import { SessionSummary } from '../screens/SessionSummary';
import { shareSessionFile } from '../lib/exportFile';
import { useMisrouteGuard, type Navigate } from '../lib/useRoute';
import type { Player, SessionEvent, SessionState } from '../domain/types';

interface SessionRouteProps {
  id: string;
  state: SessionState;
  lastBatch: SessionEvent[];
  loadById: (sessionId: string) => Promise<void>;
  players: Player[];
  onDone: () => void;
  speak: (text: string) => void;
  canSpeak: boolean;
  resuming: boolean;
  navigate: Navigate;
  narrow: boolean;
}

/** Views a past session by id, the existing History "View" action. Always read only: autoRead stays false because loadById clears lastBatch. */
export function SessionRoute({
  id, state, lastBatch, loadById, players, onDone, speak, canSpeak, resuming, navigate, narrow,
}: SessionRouteProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    void loadById(id).then(() => setLoaded(true));
  }, [id, loadById]);

  // The log wins over a stale or typo'd id. A live id has nothing to summarize yet, so it goes to the board instead.
  const target = !loaded ? null
    : state.sessionId !== id ? 'setup'
      : state.started && !state.ended ? 'board'
        : null;
  useMisrouteGuard(resuming, target, navigate);

  if (!loaded || target) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  return (
    <SessionSummary
      state={state}
      players={players}
      onExport={() => state.sessionId && void shareSessionFile(state.sessionId)}
      onDone={onDone}
      speak={speak}
      canSpeak={canSpeak}
      autoRead={lastBatch.some((e) => e.type === 'session-ended')}
      narrow={narrow}
    />
  );
}
