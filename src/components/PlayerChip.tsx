import { useState } from 'react';
import { Icon } from './Icon';

export function PlayerChip({ name, selected, onClick, rating }: {
  name: string; selected: boolean; onClick: () => void; rating?: number;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      aria-label={rating ? name + ', rated ' + rating : name}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px', height: 'var(--tap-min)', padding: '0 var(--space-3)',
        borderRadius: 'var(--radius-full)', cursor: 'pointer',
        background: selected ? (pressed ? 'var(--primary-press)' : 'var(--primary)') : pressed ? 'var(--gray-100)' : 'var(--bg)',
        color: selected ? 'var(--primary-fg)' : 'var(--text)',
        border: selected ? '1px solid transparent' : '1px solid var(--border)',
        font: '500 16px/1 var(--font-sans)',
      }}>
      {name}
      {rating ? (
        <span className="mono" aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', fontSize: '12px' }}>
          {rating}
          <Icon name="star" size={12} />
        </span>
      ) : null}
    </button>
  );
}
