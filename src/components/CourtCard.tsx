import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import { fullLineup, type Lineup, type SlotIndex } from '../domain/types';

export type CourtPhase = 'live' | 'staged' | 'empty';

const badge: Record<CourtPhase, BadgeStatus> = { live: 'live', staged: 'neutral', empty: 'neutral' };

export function CourtCard({
  court, phase, pairs, elapsed, nameOf,
  onWin, onStart, onCall, onStage, onPlayerTap, onSeatTap, onFill, onEdit, onClose, canStage, canFill,
}: {
  court: number;
  phase: CourtPhase;
  /** The four on the court, live or staged. Null on an empty court. A live court may hold an open seat. */
  pairs: Lineup | null;
  elapsed: string;
  nameOf: (playerId: string) => string;
  onWin: (winnerPair: 0 | 1) => void;
  onStart: () => void;
  /** Pages the four on this court over TTS. */
  onCall: () => void;
  onStage: () => void;
  onPlayerTap: (playerId: string) => void;
  onSeatTap: (slot: SlotIndex) => void;
  onFill: () => void;
  onEdit: () => void;
  onClose: () => void;
  /** Four or more waiting, so an empty court can be filled by hand. */
  canStage: boolean;
  /** At least one waiting, so an open seat can be filled from the queue. */
  canFill: boolean;
}) {
  // an open seat means this was never a game of four, so there is no winner to record
  const short = phase === 'live' && pairs !== null && fullLineup(pairs) === null;
  const full = phase === 'live' && pairs !== null ? fullLineup(pairs) : null;

  /**
   * One team's button, sitting on that team's side of the card. The diagram
   * directly above names the two players and captions the halves Team 1 and
   * Team 2, so the button says which side won and lets the graphic say who
   * that is.
   */
  const resultButton = (side: 0 | 1) => (
    <Button
      size="lg" onClick={() => onWin(side)}
      ariaLabel={`Team ${side + 1} wins on court ${court}`}>
      {`Team ${side + 1} wins`}
    </Button>
  );

  return (
    <div data-court={court} style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: '20px',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      {/* wraps on phone-width cards, where the timer and controls take a second row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 14px', flexWrap: 'wrap' }}>
        <span className="display" style={{ fontSize: 'var(--text-h2)', lineHeight: 1, whiteSpace: 'nowrap' }}>Court {court}</span>
        <StatusBadge
          status={badge[phase]}
          label={phase === 'staged' ? 'Staged' : phase === 'empty' ? 'Open' : undefined} />
        {/* one cluster so the timer and controls wrap together, right-aligned on either line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'auto' }}>
          {phase === 'live' ? (
            <span className="mono" style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1 }}>{elapsed}</span>
          ) : null}
          {/* the icon row itself stays tight: these two or three are one toolbar, not separate controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {pairs ? <IconButton icon="megaphone" ariaLabel={'Call players to court ' + court} onClick={onCall} /> : null}
            <IconButton icon="x" ariaLabel={'Close court ' + court} onClick={onClose} />
          </div>
        </div>
      </div>
      {pairs ? (
        <>
          <CourtDiagram
            pairs={pairs} nameOf={nameOf} onPlayerTap={onPlayerTap}
            onSeatTap={phase === 'live' ? onSeatTap : undefined} seatContext={'court ' + court} />
          {short ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button size="lg" block icon="user-plus" disabled={!canFill} onClick={onFill} ariaLabel={'Fill court ' + court}>
                Fill court
              </Button>
              <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                {canFill ? 'Fill every seat to record a winner.' : 'Nobody is waiting. Check a player in to fill this court.'}
              </span>
            </div>
          ) : full ? (
            /* Left button under team 1, right button under team 2, each the same
               width, so the row reads as the two halves of the court above it. */
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
              {resultButton(0)}
              {resultButton(1)}
            </div>
          ) : (
            // Start match stays the primary action; Choose players matches its height and width for a balanced row
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Button size="lg" icon="play" onClick={onStart} ariaLabel={'Start match on court ' + court}>Start match</Button>
              <Button variant="secondary" size="lg" icon="arrow-left-right" onClick={onEdit} ariaLabel={'Choose players on court ' + court}>Choose players</Button>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Waiting for players
          </span>
          {phase === 'empty' && canStage ? (
            <Button variant="secondary" icon="user-plus" onClick={onStage} ariaLabel={'Stage the next four on court ' + court}>Stage next four</Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
