import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function Button({ variant = 'primary', size = 'md', icon, disabled, block, onClick, children, style, ariaLabel }: ButtonProps) {
  return (
    <button type="button" className="app-button" data-variant={variant} data-size={size} data-block={block || undefined}
      disabled={disabled} onClick={onClick} aria-label={ariaLabel} style={style}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 21 : 19} /> : null}
      {children}
    </button>
  );
}
