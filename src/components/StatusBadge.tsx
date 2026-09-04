import type { CSSProperties, ReactNode } from 'react';

export type BadgeStatus = 'live' | 'danger' | 'neutral';

const looks: Record<BadgeStatus, { bg: string; text: string; word: string }> = {
  live: { bg: 'var(--status-green-bg)', text: 'var(--status-green-text)', word: 'Live' },
  danger: { bg: 'var(--status-red-bg)', text: 'var(--status-red-text)', word: 'Closed' },
  neutral: { bg: 'var(--status-neutral-bg)', text: 'var(--status-neutral-text)', word: 'Open' },
};

export function StatusBadge({ status = 'neutral', label, style }: { status?: BadgeStatus; label?: ReactNode; style?: CSSProperties }) {
  const s = looks[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: '28px', padding: '0 12px',
      borderRadius: 'var(--radius-full)', background: s.bg, color: s.text,
      font: '500 var(--text-label)/1 var(--font-sans)', ...style,
    }}>
      {label ?? s.word}
    </span>
  );
}
