import { useEffect, useState } from 'react';
import { CourtCard } from '../components/CourtCard';
import { QueueRow } from '../components/QueueRow';
import { CheckinTile, type TileState } from '../components/CheckinTile';
import { UndoPill } from '../components/UndoPill';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import type { Player, SessionState } from '../domain/types';
import type { UpNextPreview } from '../domain/templates';
import { modeLabel } from '../domain/modes';
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

export function SessionBoard({
  state, players, undoLabel, onUndo, canRedo, onRedo, onWin, onCloseCourt, onReopenCourt,
  onToggleSit, onToggleCheck, onAddCourt, onAddPlayer, preview, onCallUpNext, canCallUpNext,
}: {
  state: SessionState;
  players: Player[];
  undoLabel: string | null;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onWin: (court: number, winnerPair: 0 | 1) => void;
  onCloseCourt: (court: number) => void;
  onReopenCourt: (court: number) => void;
  onToggleSit: (playerId: string) => void;
  onToggleCheck: (playerId: string) => void;
  onAddCourt: () => void;
  onAddPlayer: (name: string) => void;
  /** A full lineup, or just the two challengers a winners template can promise. */
  preview: UpNextPreview | null;
  onCallUpNext: () => void;
  /** False while muted, when the call button would do nothing. */
  canCallUpNext: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [newName, setNewName] = useState('');
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const courts = Array.from({ length: state.courtCount }, (_, i) => i + 1);
  const eligibleQueue = state.queue.filter((p) => !state.sittingOut.includes(p));
  const nextFour = new Set(eligibleQueue.slice(0, 4));
  const grid = [...players].sort((a, b) => Number(state.checkedIn.includes(b.id)) - Number(state.checkedIn.includes(a.id)) || a.name.localeCompare(b.name));

  const tileState = (p: Player): TileState =>
    isPlaying(state, p.id) ? 'playing' : state.sittingOut.includes(p.id) ? 'sitting' : state.queue.includes(p.id) ? 'in' : 'out';

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
      {/* 104px bottom padding keeps the fixed undo pill off the last panel's win buttons */}
      <main style={{ flex: 1, minWidth: 0, padding: '24px 24px 104px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <span className="micro-label">Courts</span>
          <span style={{ flex: 1 }} />
          <Button variant="primary" icon="plus" onClick={onAddCourt} disabled={eligibleQueue.length < 4} ariaLabel="Add court">Add court</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 'var(--space-4)', alignContent: 'start' }}>
          {courts.map((n) => {
            const game = state.games[n];
            const elapsed = game ? (now - game.startedAt) / 1000 : 0;
            const status = state.closedCourts.includes(n) ? 'danger' : !game ? 'neutral' : elapsed > LONG_GAME_SECONDS ? 'warn' : 'live';
            const pairs = game ? ([game.pairs[0].map(nameOf), game.pairs[1].map(nameOf)] as SessionState['games'][number]['pairs']) : null;
            return (
              <CourtCard key={n} court={n} status={status} pairs={pairs} elapsed={fmt(elapsed)}
                onWin={(w) => onWin(n, w)} onClose={() => onCloseCourt(n)} onReopen={() => onReopenCourt(n)} />
            );
          })}
        </div>
      </main>
      <aside style={{
        width: '360px', flex: 'none', borderLeft: '1px solid var(--border)', padding: '20px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: '28px', background: 'var(--bg)',
      }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span className="micro-label">Queue</span>
            {/* the pairing below is a mode's decision, so the mode is named next to it */}
            <span style={{ font: '400 13px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}>{modeLabel(state.rule.template)}</span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{eligibleQueue.length} waiting</span>
          </div>
          {preview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-2) 4px var(--space-3)' }}>
              <span className="micro-label">{preview.kind === 'lineup' ? 'Up next' : 'Next challengers'}</span>
              <span className="display" style={{ fontSize: '15px' }}>
                {preview.kind === 'lineup'
                  ? `${preview.pairs[0].map(nameOf).join(' + ')} vs ${preview.pairs[1].map(nameOf).join(' + ')}`
                  : preview.pair.map(nameOf).join(' and ')}
              </span>
              <span style={{ flex: 1 }} />
              {canCallUpNext ? (
                <IconButton
                  icon="volume-2" size="sm" onClick={onCallUpNext}
                  ariaLabel={preview.kind === 'lineup' ? 'Call up next' : 'Call next challengers'} />
              ) : null}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {state.queue.map((id, i) => (
              <QueueRow key={id} position={i + 1} name={nameOf(id)} games={state.gamesPlayed[id] ?? 0}
                sitOut={state.sittingOut.includes(id)} nextFour={nextFour.has(id)} nextUpLabel={eligibleQueue[0] === id}
                onToggleSit={() => onToggleSit(id)} />
            ))}
          </div>
          {state.queue.length === 0 ? (
            <div style={{ padding: '0 var(--space-3)', font: '400 15px var(--font-sans)', color: 'var(--text-secondary)' }}>
              Queue is empty: everyone is on a court.
            </div>
          ) : null}
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="micro-label">Check-in</span>
          <form
            style={{ display: 'flex', gap: 'var(--space-2)' }}
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { onAddPlayer(newName.trim()); setNewName(''); } }}>
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add player" aria-label="Add player"
              style={{
                flex: 1, minWidth: 0, height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
              }} />
            <Button variant="secondary" icon="user-plus" onClick={() => { if (newName.trim()) { onAddPlayer(newName.trim()); setNewName(''); } }}>Add</Button>
          </form>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            {grid.map((p) => (
              <CheckinTile key={p.id} name={p.name} state={tileState(p)}
                games={state.checkedIn.includes(p.id) ? state.gamesPlayed[p.id] ?? 0 : undefined}
                onTap={() => onToggleCheck(p.id)} />
            ))}
          </div>
        </section>
      </aside>
      {undoLabel || canRedo ? (
        <div style={{ position: 'fixed', left: 'var(--space-4)', bottom: 'var(--space-4)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {undoLabel ? <UndoPill label={undoLabel} onUndo={onUndo} /> : null}
          {canRedo ? <Button variant="ghost" onClick={onRedo}>Redo</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
