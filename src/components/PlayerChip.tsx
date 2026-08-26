import { useState } from 'react';

export function PlayerChip({ name, selected, onClick }: { name: string; selected: boolean; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', height: 'var(--tap-min)', padding: '0 var(--space-3)',
        borderRadius: 'var(--radius-full)', cursor: 'pointer',
        background: selected ? (pressed ? 'var(--primary-press)' : 'var(--primary)') : pressed ? 'var(--gray-100)' : 'var(--bg)',
        color: selected ? 'var(--primary-fg)' : 'var(--text)',
        border: selected ? '1px solid transparent' : '1px solid var(--border)',
        font: '500 16px/1 var(--font-sans)',
      }}>
      {name}
    </button>
  );
}
