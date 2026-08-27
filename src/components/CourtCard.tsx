import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import { fullLineup, type Lineup, type SlotIndex } from '../domain/types';

export function CourtCard({
  court, status, lineup, nameOf, elapsed, canFill,
  onWin, onClose, onReopen, onFill, onAdd, onReplace, onRemove,
}: {
  court: number;
  status: BadgeStatus; // live | warn | danger (closed) | neutral (open)
  lineup: Lineup | null;
  nameOf: (playerId: string) => string;
  elapsed: string;
  /** False when the queue cannot cover a single open seat. */
  canFill: boolean;
  onWin: (winnerPair: 0 | 1) => void;
  onClose: () => void;
  onReopen: () => void;
  onFill: () => void;
  onAdd: (slot: SlotIndex) => void;
  onReplace: (slot: SlotIndex) => void;
  onRemove: (slot: SlotIndex) => void;
}) {
  const closed = status === 'danger';
  const complete = lineup !== null && fullLineup(lineup) !== null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: '20px',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span className="display" style={{ fontSize: 'var(--text-h2)', lineHeight: 1 }}>Court {court}</span>
        <StatusBadge status={status} />
        <span style={{ flex: 1 }} />
        {!closed && lineup ? (
          <span className="mono" style={{ fontSize: '40px', lineHeight: 1, letterSpacing: '-0.01em' }}>{elapsed}</span>
        ) : null}
        {closed ? (
          <Button variant="ghost" onClick={onReopen} ariaLabel={'Reopen court ' + court}>Reopen</Button>
        ) : (
          <IconButton icon="x" ariaLabel={'Close court ' + court} onClick={onClose} />
        )}
      </div>
      {closed || !lineup ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {closed ? 'Court closed' : 'Waiting for players'}
          </span>
          {!closed && canFill ? (
            <Button variant="secondary" icon="user-plus" onClick={onFill} ariaLabel={'Fill court ' + court}>Fill court</Button>
          ) : null}
        </div>
      ) : (
        <>
          <CourtDiagram court={court} lineup={lineup} nameOf={nameOf} onAdd={onAdd} onReplace={onReplace} onRemove={onRemove} />
          {complete ? (
            /* every mode records the winner so standings mean something */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Button size="lg" block icon="trophy" onClick={() => onWin(0)} ariaLabel={'Team 1 wins on court ' + court}>Team 1 wins</Button>
              <Button size="lg" block icon="trophy" onClick={() => onWin(1)} ariaLabel={'Team 2 wins on court ' + court}>Team 2 wins</Button>
            </div>
          ) : (
            /* three players never played a game of four, so there is no winner to record */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button size="lg" block icon="user-plus" disabled={!canFill} onClick={onFill} ariaLabel={'Fill court ' + court}>
                Fill court
              </Button>
              <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                {canFill ? 'Fill every seat to record a winner.' : 'Nobody is waiting. Check a player in to fill this court.'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
