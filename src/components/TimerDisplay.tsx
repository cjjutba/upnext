import type { CSSProperties } from 'react';

const sizes = { xl: 'var(--text-timer-lg)', lg: 'var(--text-timer)', md: '32px', sm: '16px' } as const;

export function TimerDisplay({ value, size = 'lg', label, muted, style }: {
  value: string; size?: keyof typeof sizes; label?: string; muted?: boolean; style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', ...style }}>
      {label ? <span className="micro-label">{label}</span> : null}
      <span className="mono" style={{ fontSize: sizes[size], lineHeight: 1, letterSpacing: 'var(--tracking-tight)', color: muted ? 'var(--text-tertiary)' : 'var(--text)' }}>
        {value}
      </span>
    </div>
  );
}
