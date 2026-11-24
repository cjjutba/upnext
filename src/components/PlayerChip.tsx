import { Icon } from './Icon';

export function PlayerChip({ name, selected, onClick, rating }: {
  name: string; selected: boolean; onClick: () => void; rating?: number;
}) {
  return (
    <button
      type="button" className="action player-choice" data-variant="secondary" onClick={onClick}
      aria-pressed={selected} aria-label={rating ? name + ', rated ' + rating : name}>
      <span style={{ overflowWrap: 'anywhere', paddingBlock: '6px' }}>{name}</span>
      {rating ? (
        <span className="mono" aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', fontSize: '12px' }}>
          {rating}
          <Icon name="star" size={12} />
        </span>
      ) : null}
    </button>
  );
}
