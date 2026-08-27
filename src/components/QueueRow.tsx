import { CountBadge } from './CountBadge';
import { IconButton } from './IconButton';

export function QueueRow({ position, name, games, sitOut, nextFour, nextUpLabel, onToggleSit }: {
  position: number; name: string; games: number; sitOut: boolean; nextFour: boolean; nextUpLabel: boolean; onToggleSit: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: '4px var(--space-3)',
      background: nextFour ? 'var(--gray-100)' : 'transparent',
      borderLeft: nextFour ? '2px solid var(--gray-1000)' : '2px solid transparent',
      borderRadius: nextFour ? '0 var(--radius-control) var(--radius-control) 0' : 'var(--radius-control)',
      opacity: sitOut ? 0.45 : 1,
    }}>
      <span className="mono" style={{ fontSize: '16px', width: '32px', textAlign: 'right', color: nextFour ? 'var(--text)' : 'var(--text-tertiary)' }}>
        {position}
      </span>
      <span className="display" style={{ fontSize: 'var(--text-queue)', flex: 1, textDecoration: sitOut ? 'line-through' : 'none' }}>
        {name}
      </span>
      {nextUpLabel && !sitOut ? <span className="micro-label">Next up</span> : null}
      <CountBadge value={games} title="Games played" />
      <IconButton name={sitOut ? 'moon' : 'sun'} label={(sitOut ? 'Return ' : 'Sit out ') + name} onClick={onToggleSit} />
    </div>
  );
}
