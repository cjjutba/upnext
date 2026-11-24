import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import { formatOpenPlayScore } from '../lib/formatOpenPlayScore';
import { fullLineup, type Lineup, type SlotIndex } from '../domain/types';

export type CourtPhase = 'live' | 'staged' | 'empty';

const badge: Record<CourtPhase, BadgeStatus> = { live: 'live', staged: 'ready', empty: 'neutral' };

export function CourtCard({
  court, phase, pairs, elapsed, nameOf, lastScore,
  onRecordScore, onStart, onCall, onStage, onPlayerTap, onSeatTap, onFill, onEdit, onClose, canStage, canFill,
}: {
  court: number;
  phase: CourtPhase;
  /** The four on the court, live or staged. Null on an empty court. A live court may hold an open seat. */
  pairs: Lineup | null;
  elapsed: string;
  nameOf: (playerId: string) => string;
  lastScore?: string;
  onRecordScore: () => void;
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
  // A court with an open seat cannot record a score.
  const short = phase === 'live' && pairs !== null && fullLineup(pairs) === null;
  const full = phase === 'live' && pairs !== null ? fullLineup(pairs) : null;

  return (
    <article data-court={court} data-phase={phase} className="court-card">
      {/* wraps on phone-width cards, where the timer and controls take a second row */}
      <div className="court-card-heading">
        <h2 className="display" tabIndex={-1}>Court {court}</h2>
        <StatusBadge
          status={badge[phase]}
          label={phase === 'staged' ? 'Ready to start' : phase === 'empty' ? 'Open' : undefined} />
        {/* one cluster so the timer and controls wrap together, right-aligned on either line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          {phase === 'live' ? (
            <span className="mono" style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1 }}>{elapsed}</span>
          ) : null}
          {/* the icon row itself stays tight: these two or three are one toolbar, not separate controls */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
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
                {canFill ? 'Fill every seat to record a score.' : 'Nobody is waiting. Check a player in to fill this court.'}
              </span>
            </div>
          ) : full ? (
            <Button size="lg" block onClick={onRecordScore} ariaLabel={`Record score for Court ${court}`}>Record score</Button>
          ) : (
            // Start match stays the primary action; Choose players matches its height and width for a balanced row
            <div className="court-card-actions">
              <Button size="lg" icon="play" onClick={onStart} ariaLabel={'Start match on court ' + court}>Start match</Button>
              <Button variant="secondary" size="lg" onClick={onEdit} ariaLabel={'Choose players on court ' + court}>Choose players</Button>
            </div>
          )}
        </>
      ) : (
        <div className="court-card-empty">
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Waiting for players
          </span>
          {phase === 'empty' && canStage ? (
            <Button variant="secondary" icon="user-plus" onClick={onStage} ariaLabel={'Stage the next four on court ' + court}>Stage next four</Button>
          ) : null}
        </div>
      )}
      {lastScore ? <p className="court-last-score">Last score <strong className="mono">{formatOpenPlayScore(lastScore)}</strong></p> : null}
    </article>
  );
}
