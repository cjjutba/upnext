import { useState } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import type { Pairs } from '../domain/types';

export function CourtCard({ court, status, pairs, elapsed, onWin, onClose, onReopen, onEdit }: {
  court: number;
  status: BadgeStatus; // live | warn | danger (closed) | neutral (open)
  pairs: Pairs | null;
  elapsed: string;
  onWin: (winnerPair: 0 | 1, score?: string) => void;
  onClose: () => void;
  onReopen: () => void;
  onEdit: () => void;
}) {
  const closed = status === 'danger';
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
        <StatusBadge status={status} />
        {/* one cluster so the timer and controls wrap together, right-aligned on either line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginLeft: 'auto' }}>
          {!closed && pairs ? (
            <span className="mono" style={{ fontSize: 'clamp(24px, 9vw, 40px)', lineHeight: 1, letterSpacing: '-0.01em' }}>{elapsed}</span>
          ) : null}
          {closed ? (
            <Button variant="ghost" onClick={onReopen} ariaLabel={'Reopen court ' + court}>Reopen</Button>
          ) : (
            <>
              {pairs ? <IconButton icon="pencil" ariaLabel={'Edit lineup on court ' + court} onClick={onEdit} /> : null}
              <IconButton icon="x" ariaLabel={'Close court ' + court} onClick={onClose} />
            </>
          )}
        </div>
      </div>
      {closed || !pairs ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4) 0' }}>
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {closed ? 'Court closed' : 'Waiting for players'}
          </span>
        </div>
      ) : (
        <>
          <CourtDiagram pairs={pairs} />
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
      )}
    </div>
  );
}
