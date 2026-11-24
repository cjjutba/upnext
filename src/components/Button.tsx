import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  type?: 'button' | 'submit';
  icon?: IconName;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
  ariaLabel?: string;
  pressed?: boolean;
}

export function Button({ variant = 'primary', size = 'md', type = 'button', icon, disabled, block, onClick, children, style, ariaLabel, pressed }: ButtonProps) {
  return (
    <button type={type} className="action" data-variant={variant} data-size={size} data-block={block || undefined}
      disabled={disabled} onClick={onClick} aria-label={ariaLabel} aria-pressed={pressed} style={style}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 21 : 19} /> : null}
      {children}
    </button>
  );
}
