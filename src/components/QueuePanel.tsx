import { Button } from './Button';
import { CourtDiagram } from './CourtDiagram';
import type { UpNextPreview } from '../domain/templates';

/**
 * One waiting match, drawn on the same court as the live ones. These fours are
 * queue order, not a court assignment, so tapping a chip edits the queue. A
 * winners template can only promise the two challengers, so its panel draws
 * them against a placeholder rather than inventing opponents.
 */
export function QueuePanel({ title, positions, preview, nameOf, onPlayerTap, onCall }: {
  title: string;
  /** "1 to 4". Queue positions the four occupy, so the panel matches the waiting list. */
  positions: string;
  preview: UpNextPreview;
  nameOf: (playerId: string) => string;
  onPlayerTap: (playerId: string) => void;
  /** Absent on every panel but the first: only the next four get called. */
  onCall?: () => void;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px',
      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span className="display" style={{ fontSize: 'var(--text-h3)', lineHeight: 1 }}>{title}</span>
        <span className="mono" style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{positions}</span>
        <span style={{ flex: 1 }} />
        {onCall ? (
          <Button variant="secondary" icon="megaphone" onClick={onCall} ariaLabel="Call players up next">Call players</Button>
        ) : null}
      </div>
      <CourtDiagram
        pairs={preview.kind === 'lineup' ? preview.pairs : [preview.pair, null]}
        nameOf={nameOf} onPlayerTap={onPlayerTap} />
    </div>
  );
}
