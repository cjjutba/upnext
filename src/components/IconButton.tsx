import { useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Square icon-only control for the top bar. The label is required and lands on
 * both aria-label and title, since the icon carries no word beside it.
 */
export function IconButton({ icon, ariaLabel, onClick, pressed, size = 'md', style }: {
  icon: IconName;
  ariaLabel: string;
  onClick: () => void;
  /** Renders aria-pressed for toggles like the mute switch. */
  pressed?: boolean;
  size?: 'sm' | 'md';
  style?: CSSProperties; // must not set background or border: those carry the pressed state
}) {
  const [down, setDown] = useState(false);
  const box = size === 'sm' ? 36 : 48;
  return (
    <button
      type="button" onClick={onClick} aria-label={ariaLabel} title={ariaLabel}
      aria-pressed={pressed}
      onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)} onPointerCancel={() => setDown(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: box, height: box, flex: '0 0 auto', padding: 0, cursor: 'pointer',
        borderRadius: 'var(--radius-control)', border: '1px solid transparent',
        background: down ? 'var(--gray-100)' : 'transparent', color: 'var(--text)',
        ...style,
      }}>
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  );
}
