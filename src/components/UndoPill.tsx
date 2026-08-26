import { useState } from 'react';
import { Icon } from './Icon';

export function UndoPill({ label, onUndo }: { label: string; onUndo: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button" onClick={onUndo}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '12px', height: 'var(--tap-primary)', padding: '0 var(--space-4)',
        borderRadius: 'var(--radius-full)', background: pressed ? 'var(--gray-100)' : 'var(--bg)',
        border: '1px solid var(--border-active)', color: 'var(--text)',
        font: '500 16px/1 var(--font-sans)', cursor: 'pointer', boxShadow: 'var(--shadow-menu)',
      }}>
      <Icon name="undo-2" size={22} />
      {label}
    </button>
  );
}
