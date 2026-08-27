import { CountBadge } from './CountBadge';
import { IconButton } from './IconButton';

/**
 * A waiting player past the last preview panel. The next four are drawn on a
 * court above, so a row never carries the next-four highlight.
 */
export function QueueRow({ position, name, games, sitOut, onToggleSit, onRemove, onOptions }: {
  position: number; name: string; games: number; sitOut: boolean;
  onToggleSit: () => void; onRemove: () => void; onOptions: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: '4px var(--space-3)',
      borderRadius: 'var(--radius-control)',
      opacity: sitOut ? 0.45 : 1,
    }}>
      <span className="mono" style={{ fontSize: '16px', width: '32px', textAlign: 'right', color: 'var(--text-tertiary)' }}>
        {position}
      </span>
      <button
        type="button" onClick={onOptions} aria-label={name + ', change or remove'}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', padding: 0, border: 'none', background: 'transparent',
          color: 'var(--text)', cursor: 'pointer', font: 'inherit',
        }}>
        <span className="display" style={{ fontSize: 'var(--text-queue)', textDecoration: sitOut ? 'line-through' : 'none' }}>
          {name}
        </span>
      </button>
      <CountBadge value={games} title="Games played" />
      <IconButton icon={sitOut ? 'moon' : 'sun'} ariaLabel={(sitOut ? 'Return ' : 'Sit out ') + name} onClick={onToggleSit} size="sm" />
      <IconButton icon="user-minus" ariaLabel={'Remove ' + name + ' from session'} onClick={onRemove} size="sm" />
    </div>
  );
}
