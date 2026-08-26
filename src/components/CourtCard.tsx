import { Button } from './Button';
import { StatusBadge, type BadgeStatus } from './StatusBadge';
import { TimerDisplay } from './TimerDisplay';
import type { Pairs } from '../domain/types';

export function CourtCard({ court, status, pairs, elapsed, needsWinner, onFinish, onWin, onClose, onReopen, onSwap }: {
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
}) {
  const closed = status === 'danger';
  const pairLabel = (p: [string, string]) => p.join(' + ');
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="display" style={{ fontSize: 'var(--text-court-num)', lineHeight: 1 }}>{court}</span>
        <StatusBadge status={status} />
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
            <span className="display" style={{ fontSize: '22px', lineHeight: 1.2 }}>{pairLabel(pairs[0])}</span>
            <span className="micro-label">vs</span>
            <span className="display" style={{ fontSize: '22px', lineHeight: 1.2 }}>{pairLabel(pairs[1])}</span>
          </div>
          <TimerDisplay value={elapsed} size="lg" />
          {needsWinner ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="secondary" size="lg" block style={{ flex: 1 }} onClick={() => onWin(0)}>{pairLabel(pairs[0])} won</Button>
              <Button variant="secondary" size="lg" block style={{ flex: 1 }} onClick={() => onWin(1)}>{pairLabel(pairs[1])} won</Button>
            </div>
          ) : (
            <Button size="lg" block icon="square" onClick={onFinish}>Game over, all four off</Button>
          )}
          <Button variant="ghost" onClick={onSwap} icon="shuffle" style={{ alignSelf: 'center' }} ariaLabel={'Swap partners on court ' + court}>
            Swap partners
          </Button>
        </>
      )}
    </div>
  );
}
