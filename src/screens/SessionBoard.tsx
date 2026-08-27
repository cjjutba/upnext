import { useEffect, useState } from 'react';
import { CourtCard, type CourtPhase } from '../components/CourtCard';
import { QueuePanel } from '../components/QueuePanel';
import { QueueRow } from '../components/QueueRow';
import { CheckinTile, type TileState } from '../components/CheckinTile';
import { UndoPill } from '../components/UndoPill';
import { Button } from '../components/Button';
import { PlayerPickerModal } from '../components/PlayerPickerModal';
import type { Player, SessionState, SlotIndex } from '../domain/types';
import { openCourts } from '../domain/types';
import type { UpNextPreview } from '../domain/templates';
import { modeLabel } from '../domain/modes';
import { isPlaying, isStaged } from '../domain/reducer';

// wall clock on purpose: timers derive from event ts so resume replays exactly; a mid-session OS clock change can jump timers, accepted trade-off
const LONG_GAME_SECONDS = 900;

/**
 * The one animation in the app. The rail slides rather than snapping, because
 * the courts resize with it and an instant jump reads as a repaint bug. Short
 * enough that a tap still feels answered at once, and skipped entirely when
 * the device asks for reduced motion.
 */
const RAIL_MOTION = '180ms ease';

const fmt = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
export { fmt };

export function SessionBoard({
  state, players, undoLabel, onUndo, canRedo, onRedo, onWin, onCloseCourt,
  onToggleSit, onToggleCheck, onAddCourt, onAddPlayer, onRemovePlayer, onCourtPlayerTap, onQueuePlayerTap,
  onStart, onStage, onShuffle, onCallCourt, onCallPreview, onEditLineup, previews, narrow, railCollapsed, motion, recency,
  onSeatPlayer, onCreateAndSeat, onFillCourt,
}: {
  state: SessionState;
  players: Player[];
  undoLabel: string | null;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  onWin: (court: number, winnerPair: 0 | 1, score?: string) => void;
  onCloseCourt: (court: number) => void;
  onToggleSit: (playerId: string) => void;
  onToggleCheck: (playerId: string) => void;
  onAddCourt: () => void;
  onAddPlayer: (name: string) => void;
  onRemovePlayer: (playerId: string) => void;
  /** A chip on a live or staged court. Opens the picker in substitute mode. */
  onCourtPlayerTap: (court: number, playerId: string) => void;
  /** A chip or row in the queue section. Opens the picker in reorder mode. */
  onQueuePlayerTap: (playerId: string) => void;
  onStart: (court: number) => void;
  onStage: (court: number) => void;
  onShuffle: (court: number) => void;
  onCallCourt: (court: number) => void;
  /** Call the four on waiting panel i. Every panel has its own button. */
  onCallPreview: (index: number) => void;
  onEditLineup: (court: number) => void;
  /** Waiting matches, four at a time. The first promises only what the mode can: a lineup, or two challengers. */
  previews: UpNextPreview[];
  /** Phone portrait: the rail stacks under the courts and the page scrolls as one. */
  narrow: boolean;
  /** The organizer hid check-in to give the courts the full width. Wide slides the rail out; narrow keeps its header. */
  railCollapsed: boolean;
  /** False when the device asks for reduced motion, which drops the rail transition. */
  motion: boolean;
  /** startedAt of the newest ended session each player attended; regulars sort first. */
  recency: Record<string, number>;
  onSeatPlayer: (court: number, slot: SlotIndex, playerId: string) => void;
  onCreateAndSeat: (court: number, slot: SlotIndex, name: string) => void;
  onFillCourt: (court: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [newName, setNewName] = useState('');
  const [query, setQuery] = useState('');
  // which open seat the organizer is filling. View state, not session truth, so it never outlives a tap
  const [seating, setSeating] = useState<{ court: number; slot: SlotIndex } | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const courts = openCourts(state);
  const eligibleQueue = state.queue.filter((p) => !state.sittingOut.includes(p));
  // checkedIn only grows, so anyone who left has to be subtracted rather than looked up there
  const present = state.checkedIn.filter((id) => !state.departed.includes(id));
  const previewed = new Set(previews.flatMap((p) => (p.kind === 'lineup' ? [...p.pairs[0], ...p.pairs[1]] : p.pair)));
  const leftovers = state.queue.filter((id) => !previewed.has(id));
  const grid = [...players]
    .sort((a, b) =>
      Number(state.checkedIn.includes(b.id)) - Number(state.checkedIn.includes(a.id)) ||
      (recency[b.id] ?? 0) - (recency[a.id] ?? 0) ||
      a.name.localeCompare(b.name))
    .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const tileState = (p: Player): TileState =>
    isPlaying(state, p.id) ? 'playing'
      : isStaged(state, p.id) ? 'staged'
        : state.sittingOut.includes(p.id) ? 'sitting'
          : state.queue.includes(p.id) ? 'in' : 'out';

  /** Where a preview sits in the waiting list, so the panels and the rows line up. */
  const positions = (preview: UpNextPreview, i: number) =>
    preview.kind === 'challengers' ? '1 and 2' : `${i * 4 + 1} to ${i * 4 + 4}`;

  /**
   * The queue section tracks the courts grid, so a panel is a court card's
   * width and the waiting rows sit under the first one. auto-fill, not
   * auto-fit: a lone panel would otherwise stretch across the whole column.
   */
  const queueGrid = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))',
    gap: 'var(--space-4)', alignContent: 'start',
  } as const;

  return (
    <div style={narrow
      ? { display: 'flex', flexDirection: 'column' }
      : { display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
      {/* 104px bottom padding keeps the fixed undo pill off the last panel */}
      <main style={narrow
        ? { minWidth: 0, padding: '16px', display: 'flex', flexDirection: 'column', gap: '28px' }
        : { flex: 1, minWidth: 0, padding: '24px 24px 104px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span className="micro-label">Courts</span>
            <span style={{ flex: 1 }} />
            {/* with no courts open there is nothing left to undo into, so the button has to stay live even for a short queue */}
            <Button variant="primary" icon="plus" onClick={onAddCourt} disabled={courts.length > 0 && eligibleQueue.length < 4} ariaLabel="Add court">Add court</Button>
          </div>
          {courts.length === 0 ? (
            <div style={{ padding: 'var(--space-3)', font: '400 15px var(--font-sans)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
              No courts open. Add a court to keep playing.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))', gap: 'var(--space-4)', alignContent: 'start' }}>
              {courts.map((n) => {
                const game = state.games[n];
                const staged = state.staged[n];
                const elapsed = game ? (now - game.startedAt) / 1000 : 0;
                const phase: CourtPhase = game ? 'live' : staged ? 'staged' : 'empty';
                return (
                  // keyed by the game so the score field starts blank on every refill
                  <CourtCard key={n + ':' + (game?.startedEventId ?? 'open')} court={n} phase={phase} longGame={elapsed > LONG_GAME_SECONDS}
                    pairs={game?.pairs ?? staged ?? null}
                    elapsed={fmt(elapsed)} nameOf={nameOf} canStage={eligibleQueue.length >= 4}
                    canFill={eligibleQueue.length > 0}
                    onWin={(w, score) => onWin(n, w, score)} onStart={() => onStart(n)} onCall={() => onCallCourt(n)}
                    onShuffle={() => onShuffle(n)} onStage={() => onStage(n)}
                    onPlayerTap={(id) => onCourtPlayerTap(n, id)} onEdit={() => onEditLineup(n)}
                    onSeatTap={(slot) => setSeating({ court: n, slot })} onFill={() => onFillCourt(n)}
                    onClose={() => onCloseCourt(n)} />
                );
              })}
            </div>
          )}
        </section>

        {/* the queue exists because courts do: with none open there is nothing for a waiting four to be waiting for */}
        {courts.length === 0 ? null : (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className="micro-label">Queue</span>
              {/* the pairings below are a mode's decision, so the mode is named next to them */}
              <span style={{ font: '400 13px/1 var(--font-sans)', color: 'var(--text-tertiary)' }}>{modeLabel(state.rule.template)}</span>
              <span style={{ flex: 1 }} />
              <span className="mono" style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{eligibleQueue.length} waiting</span>
            </div>
            <div style={queueGrid}>
              {previews.length === 0 ? (
                <div style={{ padding: 'var(--space-3)', font: '400 15px var(--font-sans)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
                  {state.queue.length === 0
                    ? 'Queue is empty: everyone is on a court.'
                    : 'Fewer than four waiting, so there is no next match yet.'}
                </div>
              ) : previews.map((preview, i) => (
                <QueuePanel key={positions(preview, i)} positions={positions(preview, i)}
                  title={preview.kind === 'challengers' ? 'Next challengers' : i === 0 ? 'Up next' : `Then, match ${i + 1}`}
                  preview={preview} nameOf={nameOf} onPlayerTap={onQueuePlayerTap}
                  onCall={() => onCallPreview(i)}
                  callLabel={i === 0 ? 'Call players up next' : `Call players for match ${i + 1}`} />
              ))}
            </div>
            {leftovers.length > 0 ? (
              <div style={queueGrid}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <span className="micro-label">Also waiting</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {leftovers.map((id) => (
                      <QueueRow key={id} position={state.queue.indexOf(id) + 1} name={nameOf(id)} games={state.gamesPlayed[id] ?? 0}
                        sitOut={state.sittingOut.includes(id)}
                        onToggleSit={() => onToggleSit(id)} onRemove={() => onRemovePlayer(id)}
                        onOptions={() => onQueuePlayerTap(id)} />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>
      {/*
        The rail stays mounted at zero width so the collapse can be animated;
        an unmounted element has nothing to transition from. `inert` is what
        keeps the hidden copy out of the tab order and the screen reader.
      */}
      <aside
        aria-label="Check-in"
        inert={railCollapsed && !narrow ? true : undefined}
        style={narrow
          ? {
            // the 104px keeps the fixed undo pill off the section, collapsed or not: the count row is the last thing on the page
            borderTop: '1px solid var(--border)', padding: '20px 16px 104px',
            display: 'flex', flexDirection: 'column', gap: '28px', background: 'var(--bg)',
          }
          : {
            width: railCollapsed ? '0px' : '360px', flex: 'none', overflow: 'hidden',
            borderLeft: 'solid var(--border)', borderLeftWidth: railCollapsed ? '0px' : '1px',
            background: 'var(--bg)',
            transition: motion ? `width ${RAIL_MOTION}, border-left-width ${RAIL_MOTION}` : undefined,
          }}>
        <div style={narrow
          ? { display: 'flex', flexDirection: 'column', gap: '28px' }
          // a fixed width keeps the names from rewrapping while the rail slides
          : { width: '360px', height: '100%', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span className="micro-label">Check-in</span>
              {/* on a phone the count is all that is left, so it has to say who is actually still here */}
              {narrow && railCollapsed ? (
                <>
                  <span style={{ flex: 1 }} />
                  <span className="mono" style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{present.length} in</span>
                </>
              ) : null}
            </div>
            {/* 0fr to 1fr is the one way to animate a height the content decides */}
            <div
              inert={railCollapsed ? true : undefined}
              style={{
                display: 'grid', gridTemplateRows: narrow && railCollapsed ? '0fr' : '1fr',
                transition: motion && narrow ? `grid-template-rows ${RAIL_MOTION}` : undefined,
              }}>
              <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                {players.length > 12 ? (
                  <input
                    value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players"
                    style={{
                      minWidth: 0, height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
                    }} />
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                  {grid.map((p) => (
                    <CheckinTile key={p.id} name={p.name} state={tileState(p)}
                      games={state.checkedIn.includes(p.id) ? state.gamesPlayed[p.id] ?? 0 : undefined}
                      onTap={() => onToggleCheck(p.id)} />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>
      {seating ? (
        <PlayerPickerModal
          title={`Add a player to court ${seating.court}`}
          waiting={eligibleQueue}
          sittingOut={state.queue.filter((p) => state.sittingOut.includes(p))}
          notCheckedIn={players
            .filter((p) => !state.queue.includes(p.id) && !isPlaying(state, p.id) && !isStaged(state, p.id))
            .map((p) => p.id)}
          nameOf={nameOf}
          gamesOf={(id) => state.gamesPlayed[id] ?? 0}
          onPick={(id) => { onSeatPlayer(seating.court, seating.slot, id); setSeating(null); }}
          onCreate={(name) => { onCreateAndSeat(seating.court, seating.slot, name); setSeating(null); }}
          onClose={() => setSeating(null)} />
      ) : null}
      {undoLabel || canRedo ? (
        <div style={{ position: 'fixed', left: 'var(--space-4)', bottom: 'var(--space-4)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {undoLabel ? <UndoPill label={undoLabel} onUndo={onUndo} /> : null}
          {canRedo ? <Button variant="ghost" onClick={onRedo}>Redo</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
