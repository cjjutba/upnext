import { SessionSummary } from '../screens/SessionSummary';
import { shareSessionFile } from '../lib/exportFile';
import { useMisrouteGuard, type Navigate } from '../lib/useRoute';
import type { Player, SessionState } from '../domain/types';

interface SummaryRouteProps {
  state: SessionState;
  players: Player[];
  autoRead: boolean;
  onDone: () => void;
  speak: (text: string) => void;
  canSpeak: boolean;
  resuming: boolean;
  navigate: Navigate;
  narrow: boolean;
}

export function SummaryRoute({ state, players, autoRead, onDone, speak, canSpeak, resuming, navigate, narrow }: SummaryRouteProps) {
  // Nothing started yet: back to setup. Started but not ended: a live session exists, nothing to summarize yet.
  const target = !state.started ? 'setup' : !state.ended ? 'board' : null;
  useMisrouteGuard(resuming, target, navigate);

  if (target) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  return (
    <SessionSummary
      state={state}
      players={players}
      onExport={() => state.sessionId && void shareSessionFile(state.sessionId)}
      onDone={onDone}
      speak={speak}
      canSpeak={canSpeak}
      autoRead={autoRead}
      narrow={narrow}
    />
  );
}
