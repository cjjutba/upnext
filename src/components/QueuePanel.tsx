import { Button } from './Button';
import { CourtDiagram } from './CourtDiagram';
import type { UpNextPreview } from '../domain/templates';

/**
 * One waiting match, drawn on the same court as the live ones. These fours are
 * queue order, not a court assignment, so tapping a chip edits the queue. A
 * winners template can only promise the two challengers, so its panel draws
 * them against a placeholder rather than inventing opponents.
 */
export function QueuePanel({ title, positions, next, preview, nameOf, onPlayerTap, onCall, callLabel }: {
  title: string;
  next: boolean;
  /** "1 to 4". Queue positions the four occupy, so the panel matches the waiting list. */
  positions: string;
  preview: UpNextPreview;
  nameOf: (playerId: string) => string;
  onPlayerTap: (playerId: string) => void;
  /** Every panel calls its own four, so a court freeing up never waits on the panel above it. */
  onCall: () => void;
  /** Says which match is being called, because the button reads the same on every panel. */
  callLabel: string;
}) {
  return (
    <article aria-label={title} className="queue-preview" data-next={next || undefined}>
      <div className="panel-heading">
        <div>
          <h3 className={next ? 'queue-lead queue-title' : 'display queue-title'}>{title}</h3>
          <span className="micro-label mono">{positions}</span>
        </div>
        <Button variant="secondary" icon="megaphone" onClick={onCall} ariaLabel={callLabel}>Call players</Button>
      </div>
      <CourtDiagram
        pairs={preview.kind === 'lineup' ? preview.pairs : [preview.pair, null]}
        nameOf={nameOf} onPlayerTap={onPlayerTap} />
    </article>
  );
}
