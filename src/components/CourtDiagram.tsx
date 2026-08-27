import type { Pairs } from '../domain/types';

/**
 * Top-down pickleball court, true 44x20 ft proportions in a 860x420 viewBox.
 * The colors are literal by design: the court is imagery, the one sanctioned
 * exception to the monochrome UI. pairs[0] is team 1 on the left.
 */
export function CourtDiagram({ pairs }: { pairs: Pairs }) {
  const chip = (name: string, left: string, top: string) => (
    <span style={{
      position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
      background: 'rgba(23,23,23,0.85)', color: '#ffffff', padding: '8px 16px',
      borderRadius: 'var(--radius-full)', font: '600 15px/1 var(--font-sans)',
      whiteSpace: 'nowrap', maxWidth: '26%', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box',
    }}>{name}</span>
  );
  const teamLabel = (label: string, left: string) => (
    <span style={{
      position: 'absolute', left, top: '8px', transform: 'translateX(-50%)',
      font: '600 12px/1 var(--font-sans)', color: 'rgba(255,255,255,0.9)', pointerEvents: 'none',
    }}>{label}</span>
  );
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '860 / 420', background: '#135a83', borderRadius: '8px', overflow: 'hidden' }}>
      <svg viewBox="0 0 860 420" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
        <rect x="0" y="0" width="860" height="420" fill="#135a83" />
        <rect x="52" y="38" width="258" height="344" fill="#2778ab" />
        <rect x="310" y="38" width="240" height="344" fill="#8fbc5a" />
        <rect x="550" y="38" width="258" height="344" fill="#2778ab" />
        <rect x="430" y="38" width="16" height="344" fill="rgba(0,0,0,0.10)" />
        <rect x="52" y="38" width="756" height="344" fill="none" stroke="#ffffff" strokeWidth="3" />
        <line x1="310" y1="38" x2="310" y2="382" stroke="#ffffff" strokeWidth="3" />
        <line x1="550" y1="38" x2="550" y2="382" stroke="#ffffff" strokeWidth="3" />
        <line x1="52" y1="210" x2="310" y2="210" stroke="#ffffff" strokeWidth="3" />
        <line x1="550" y1="210" x2="808" y2="210" stroke="#ffffff" strokeWidth="3" />
        <line x1="59" y1="210" x2="71" y2="210" stroke="#ffffff" strokeWidth="3" />
        <line x1="789" y1="210" x2="801" y2="210" stroke="#ffffff" strokeWidth="3" />
        <line x1="430" y1="16" x2="430" y2="404" stroke="#16262e" strokeWidth="7" />
        <line x1="430" y1="16" x2="430" y2="404" stroke="rgba(255,255,255,0.28)" strokeWidth="3" strokeDasharray="2 6" />
        <circle cx="430" cy="14" r="7" fill="#171717" />
        <circle cx="430" cy="406" r="7" fill="#171717" />
      </svg>
      {teamLabel('Team 1', '21%')}
      {teamLabel('Team 2', '79%')}
      {chip(pairs[0][0], '21%', '29.5%')}
      {chip(pairs[0][1], '21%', '70.5%')}
      {chip(pairs[1][0], '79%', '29.5%')}
      {chip(pairs[1][1], '79%', '70.5%')}
    </div>
  );
}
