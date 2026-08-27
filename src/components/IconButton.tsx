import { useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';

/** 48px icon-only button. The label is required: it is the accessible name and the hover title. */
export function IconButton({ name, label, onClick, style }: {
  name: IconName; label: string; onClick: () => void; style?: CSSProperties;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 'var(--tap-min)', height: 'var(--tap-min)', flex: 'none',
        background: pressed ? 'var(--gray-100)' : 'transparent', color: 'var(--text-secondary)',
        border: '1px solid transparent', borderRadius: 'var(--radius-control)', cursor: 'pointer', ...style,
      }}>
      <Icon name={name} size={24} />
    </button>
  );
}
