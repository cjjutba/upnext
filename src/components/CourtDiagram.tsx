import type { Pair } from '../domain/types';

/** Monochrome pickleball court, portrait, true 20x44 line geometry. */
export function CourtDiagram({ top, bottom }: { top: Pair; bottom: Pair }) {
  const half = (names: Pair, area: 'top' | 'bottom') => (
    <div style={{
      position: 'absolute', left: 0, right: 0,
      [area]: 0, height: '34%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
      padding: '0 6px',
    }}>
      {names.map((n) => (
        <span key={n} className="display" style={{
          fontSize: '14px', lineHeight: 1.15, maxWidth: '100%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{n}</span>
      ))}
    </div>
  );
  return (
    <div style={{ position: 'relative', height: '260px', aspectRatio: '20 / 44', margin: '0 auto' }}>
      <svg viewBox="0 0 20 44" preserveAspectRatio="none" aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <rect x="0.35" y="0.35" width="19.3" height="43.3" fill="var(--bg-secondary)" stroke="var(--gray-500)" strokeWidth="0.35" />
        <line x1="0.35" y1="15" x2="19.65" y2="15" stroke="var(--gray-500)" strokeWidth="0.25" />
        <line x1="0.35" y1="29" x2="19.65" y2="29" stroke="var(--gray-500)" strokeWidth="0.25" />
        <line x1="10" y1="0.35" x2="10" y2="15" stroke="var(--gray-500)" strokeWidth="0.25" />
        <line x1="10" y1="29" x2="10" y2="43.65" stroke="var(--gray-500)" strokeWidth="0.25" />
        <line x1="0" y1="22" x2="20" y2="22" stroke="var(--gray-1000)" strokeWidth="0.7" />
      </svg>
      {half(top, 'top')}
      {half(bottom, 'bottom')}
    </div>
  );
}
