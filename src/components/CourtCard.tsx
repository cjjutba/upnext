import { Button } from './Button';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { CourtDiagram } from './CourtDiagram';
import type { Pairs } from '../domain/types';

export function CourtCard({ court, status, pairs, elapsed, needsWinner, onFinish, onWin, onClose, onReopen, onSwap, compact }: {
  court: number;
  status: BadgeStatus; // live | warn | danger (closed) | neutral (open)
  pairs: Pairs | null;
  elapsed: string;
  needsWinner: boolean;
  onFinish: () => void;
  onWin: (winnerPair: 0 | 1) => void;
  onClose: () => void;
  onReopen: () => void;
  onSwap: () => void;
  compact?: boolean;
}) {
  const closed = status === 'danger';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: compact ? 'var(--space-2)' : 'var(--space-3)', padding: compact ? 'var(--space-3)' : 'var(--space-4)',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="display" style={{ fontSize: 'var(--text-h2)', lineHeight: 1 }}>{court}</span>
        <StatusBadge status={status} />
        {!closed && pairs ? (
          <span className="mono" style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{elapsed}</span>
        ) : null}
        <span style={{ flex: 1 }} />
        {closed ? (
          <Button variant="ghost" onClick={onReopen} ariaLabel={'Reopen court ' + court}>Reopen</Button>
        ) : (
          <Button variant="ghost" onClick={onClose} icon="x" ariaLabel={'Close court ' + court}>Close court</Button>
        )}
      </div>
      {closed || !pairs ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4) 0' }}>
          <span style={{ font: '400 16px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {closed ? 'Court closed' : 'Waiting for players'}
          </span>
        </div>
      ) : (
        <>
          <CourtDiagram top={pairs[0]} bottom={pairs[1]} height={compact ? 190 : undefined} />
          {needsWinner ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button variant="secondary" size="lg" block onClick={() => onWin(0)}>Top pair won</Button>
              <Button variant="secondary" size="lg" block onClick={() => onWin(1)}>Bottom pair won</Button>
            </div>
          ) : (
            <Button size="lg" block icon="square" onClick={onFinish}>Game over</Button>
          )}
          <Button variant="ghost" onClick={onSwap} icon="shuffle" style={{ alignSelf: 'center' }} ariaLabel={'Swap partners on court ' + court}>
            Swap partners
          </Button>
        </>
      )}
    </div>
  );
}
