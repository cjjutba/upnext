import { useEffect, useState } from 'react';
import { CourtCard } from '../components/CourtCard';
import { QueueRow } from '../components/QueueRow';
import { CheckinTile, type TileState } from '../components/CheckinTile';
import { UndoPill } from '../components/UndoPill';
import { Button } from '../components/Button';
import type { Player, SessionState } from '../domain/types';
import { isPlaying } from '../domain/reducer';

// wall clock on purpose: timers derive from event ts so resume replays exactly; a mid-session OS clock change can jump timers, accepted trade-off
const LONG_GAME_SECONDS = 900;

const fmt = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
export { fmt };

export function SessionBoard({ state, players, undoLabel, onUndo, canRedo, onRedo, onFinish, onWin, onCloseCourt, onReopenCourt, onToggleSit, onToggleCheck, onSwap }: {
  state: SessionState;
  players: Player[];
  undoLabel: string | null;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onFinish: (court: number) => void;
  onWin: (court: number, winnerPair: 0 | 1) => void;
  onCloseCourt: (court: number) => void;
  onReopenCourt: (court: number) => void;
  onToggleSit: (playerId: string) => void;
  onToggleCheck: (playerId: string) => void;
  onSwap: (court: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const needsWinner = state.rule.template !== 'all-off';
  const courts = Array.from({ length: state.courtCount }, (_, i) => i + 1);
  const eligibleQueue = state.queue.filter((p) => !state.sittingOut.includes(p));
  const nextFour = new Set(eligibleQueue.slice(0, 4));
  const grid = [...players].sort((a, b) => Number(state.checkedIn.includes(b.id)) - Number(state.checkedIn.includes(a.id)) || a.name.localeCompare(b.name));

  const tileState = (p: Player): TileState =>
    isPlaying(state, p.id) ? 'playing' : state.sittingOut.includes(p.id) ? 'sitting' : state.queue.includes(p.id) ? 'in' : 'out';

  return (
    /* clearance so the fixed undo pill can never cover a court card's bottom action */
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 'var(--space-4)', padding: 'var(--space-4)', alignItems: 'start', paddingBottom: undoLabel ? 'calc(var(--tap-primary) + var(--space-5))' : undefined }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
        {courts.map((n) => {
          const game = state.games[n];
          const elapsed = game ? (now - game.startedAt) / 1000 : 0;
          const status = state.closedCourts.includes(n) ? 'danger' : !game ? 'neutral' : elapsed > LONG_GAME_SECONDS ? 'warn' : 'live';
          const pairs = game ? ([game.pairs[0].map(nameOf), game.pairs[1].map(nameOf)] as SessionState['games'][number]['pairs']) : null;
          return (
            <CourtCard key={n} court={n} status={status} pairs={pairs} elapsed={fmt(elapsed)} needsWinner={needsWinner}
              onFinish={() => onFinish(n)} onWin={(w) => onWin(n, w)} onClose={() => onCloseCourt(n)} onReopen={() => onReopenCourt(n)}
              onSwap={() => onSwap(n)} />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px var(--space-3)' }}>
            <span className="micro-label">Up next</span>
            <span className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{state.queue.length} waiting</span>
          </div>
          {state.queue.map((id, i) => (
            <QueueRow key={id} position={i + 1} name={nameOf(id)} games={state.gamesPlayed[id] ?? 0}
              sitOut={state.sittingOut.includes(id)} nextFour={nextFour.has(id)} nextUpLabel={eligibleQueue[0] === id}
              onToggleSit={() => onToggleSit(id)} />
          ))}
          {state.queue.length === 0 ? (
            <div style={{ padding: 'var(--space-3)', font: '400 15px var(--font-sans)', color: 'var(--text-secondary)' }}>
              Queue is empty: everyone is on a court.
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="micro-label" style={{ padding: '0 var(--space-1)' }}>Check-in</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            {grid.map((p) => (
              <CheckinTile key={p.id} name={p.name} state={tileState(p)}
                games={state.checkedIn.includes(p.id) ? state.gamesPlayed[p.id] ?? 0 : undefined}
                onTap={() => onToggleCheck(p.id)} />
            ))}
          </div>
        </div>
      </div>
      {undoLabel ? (
        <div style={{ position: 'fixed', left: 'var(--space-4)', bottom: 'var(--space-4)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <UndoPill label={undoLabel} onUndo={onUndo} />
          {canRedo ? <Button variant="ghost" onClick={onRedo}>Redo</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
