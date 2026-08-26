import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  block?: boolean;
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}

export function Button({ variant = 'primary', size = 'md', icon, disabled, block, onClick, children, style }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const looks: Record<string, CSSProperties> = {
    primary: { background: pressed ? 'var(--primary-press)' : 'var(--primary)', color: 'var(--primary-fg)', border: '1px solid transparent' },
    secondary: { background: pressed ? 'var(--gray-100)' : 'var(--bg)', color: 'var(--text)', border: `1px solid ${pressed ? 'var(--border-active)' : 'var(--border)'}` },
    ghost: { background: pressed ? 'var(--gray-100)' : 'transparent', color: 'var(--text)', border: '1px solid transparent' },
  };
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      style={{
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)',
        height: size === 'lg' ? 'var(--tap-primary)' : 'var(--tap-min)', padding: '0 var(--space-4)',
        borderRadius: 'var(--radius-control)', cursor: disabled ? 'default' : 'pointer',
        font: `500 ${size === 'lg' ? '18px' : '16px'}/1 var(--font-sans)`,
        opacity: disabled ? 0.4 : 1, ...looks[variant], ...style,
      }}>
      {icon ? <Icon name={icon} size={size === 'lg' ? 22 : 20} /> : null}
      {children}
    </button>
  );
}
