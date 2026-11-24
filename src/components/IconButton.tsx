import type { CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';

export function IconButton({ icon, ariaLabel, onClick, pressed, size = 'md', style }: {
  icon: IconName;
  ariaLabel: string;
  onClick: () => void;
  pressed?: boolean;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  return (
    <button type="button" className="app-icon-button" onClick={onClick} aria-label={ariaLabel} title={ariaLabel}
      aria-pressed={pressed} style={style}>
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  );
}
