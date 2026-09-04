import { useState } from 'react';
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
  onWin: (winnerPair: 0 | 1, score?: string) => void;
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
  // per game: the parent keys this card by the game, so a refill starts blank
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const scoreEntered = score1.trim() !== '' && score2.trim() !== '';
  const win = (pair: 0 | 1) => onWin(pair, `${score1.trim()}-${score2.trim()}`);
  const digitsOnly = (v: string) => v.replace(/\D/g, '');
  // an open seat means this was never a game of four, so there is no winner to record
  const short = phase === 'live' && pairs !== null && fullLineup(pairs) === null;
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
          ) : phase === 'live' ? (
            <>
              {/* a small score chip sits right above its own team's button, so the pairing needs no caption */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input
                  value={score1} onChange={(e) => setScore1(digitsOnly(e.target.value))}
                  inputMode="numeric" maxLength={2} placeholder="0" aria-label={'Team 1 score on court ' + court}
                  className="mono"
                  style={{
                    width: '52px', height: '36px', margin: '0 auto', display: 'block',
                    textAlign: 'center', fontSize: '16px',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
                  }} />
                <input
                  value={score2} onChange={(e) => setScore2(digitsOnly(e.target.value))}
                  inputMode="numeric" maxLength={2} placeholder="0" aria-label={'Team 2 score on court ' + court}
                  className="mono"
                  style={{
                    width: '52px', height: '36px', margin: '0 auto', display: 'block',
                    textAlign: 'center', fontSize: '16px',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
                  }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Button size="lg" block icon="trophy" disabled={!scoreEntered} onClick={() => win(0)} ariaLabel={'Team 1 wins on court ' + court}>Team 1 wins</Button>
                <Button size="lg" block icon="trophy" disabled={!scoreEntered} onClick={() => win(1)} ariaLabel={'Team 2 wins on court ' + court}>Team 2 wins</Button>
              </div>
            </>
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
