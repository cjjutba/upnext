import { useState } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import type { Pairs } from '../domain/types';

export type CourtPhase = 'live' | 'staged' | 'empty' | 'closed';

const badge: Record<CourtPhase, BadgeStatus> = { live: 'live', staged: 'neutral', empty: 'neutral', closed: 'danger' };

export function CourtCard({
  court, phase, longGame, pairs, elapsed, nameOf,
  onWin, onStart, onCall, onShuffle, onStage, onPlayerTap, onEdit, onClose, onReopen, canStage,
}: {
  court: number;
  phase: CourtPhase;
  /** Live game past the long-game threshold. Only changes the badge. */
  longGame?: boolean;
  /** The four on the court, live or staged. Null on an empty or closed court. */
  pairs: Pairs | null;
  elapsed: string;
  nameOf: (playerId: string) => string;
  onWin: (winnerPair: 0 | 1, score?: string) => void;
  onStart: () => void;
  onCall: () => void;
  onShuffle: () => void;
  onStage: () => void;
  onPlayerTap: (playerId: string) => void;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  /** Four or more waiting, so an empty court can be filled by hand. */
  canStage: boolean;
}) {
  // per game: the parent keys this card by the game, so a refill starts blank
  const [score, setScore] = useState('');
  const win = (pair: 0 | 1) => onWin(pair, score.trim() || undefined);
  return (
    <div data-court={court} style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: '20px',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      {/* wraps on phone-width cards, where the timer and controls take a second row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 14px', flexWrap: 'wrap' }}>
        <span className="display" style={{ fontSize: 'var(--text-h2)', lineHeight: 1, whiteSpace: 'nowrap' }}>Court {court}</span>
        <StatusBadge
          status={phase === 'live' && longGame ? 'warn' : badge[phase]}
          label={phase === 'staged' ? 'Staged' : phase === 'empty' ? 'Open' : undefined} />
        {/* one cluster so the timer and controls wrap together, right-aligned on either line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
          {phase === 'live' ? (
            <span className="mono" style={{ fontSize: 'clamp(24px, 9vw, 40px)', lineHeight: 1, letterSpacing: '-0.01em' }}>{elapsed}</span>
          ) : null}
          {phase === 'closed' ? (
            <Button variant="ghost" onClick={onReopen} ariaLabel={'Reopen court ' + court}>Reopen</Button>
          ) : (
            <>
              {pairs ? <IconButton icon="pencil" ariaLabel={'Edit lineup on court ' + court} onClick={onEdit} /> : null}
              <IconButton icon="x" ariaLabel={'Close court ' + court} onClick={onClose} />
            </>
          )}
        </div>
      </div>
      {pairs ? (
        <>
          <CourtDiagram pairs={pairs} nameOf={nameOf} onPlayerTap={onPlayerTap} />
          {phase === 'live' ? (
            <>
              {/* every mode records the winner so standings mean something */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Button size="lg" block icon="trophy" onClick={() => win(0)} ariaLabel={'Team 1 wins on court ' + court}>Team 1 wins</Button>
                <Button size="lg" block icon="trophy" onClick={() => win(1)} ariaLabel={'Team 2 wins on court ' + court}>Team 2 wins</Button>
              </div>
              <input
                value={score} onChange={(e) => setScore(e.target.value)}
                placeholder="Score, optional" aria-label={'Score on court ' + court}
                className="mono"
                style={{
                  height: 'var(--tap-min)', padding: '0 var(--space-3)', textAlign: 'center', fontSize: '15px',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
                }} />
            </>
          ) : (
            /* wraps rather than squeezing: on a phone-width card these three take two rows */
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              <Button size="lg" icon="play" onClick={onStart} style={{ flex: '1 1 160px' }} ariaLabel={'Start match on court ' + court}>Start match</Button>
              <Button variant="secondary" size="lg" icon="megaphone" onClick={onCall} ariaLabel={'Call players to court ' + court}>Call players</Button>
              <Button variant="secondary" size="lg" icon="shuffle" onClick={onShuffle} ariaLabel={'Shuffle pairing on court ' + court}>Shuffle</Button>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) 0' }}>
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {phase === 'closed' ? 'Court closed' : 'Waiting for players'}
          </span>
          {phase === 'empty' && canStage ? (
            <Button variant="secondary" icon="user-plus" onClick={onStage} ariaLabel={'Stage the next four on court ' + court}>Stage next four</Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
