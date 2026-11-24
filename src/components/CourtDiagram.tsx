import { Icon } from './Icon';
import type { Lineup, SlotIndex, SlotPair } from '../domain/types';

/** A four, a four with open seats, or a pair whose opponents are not decided yet. */
export type DiagramPairs = Lineup | [SlotPair, null];

/** Placement per slot index: team 1 top then bottom, then team 2. */
const PLACE: Record<SlotIndex, { left: string; top: string }> = {
  0: { left: '21%', top: '30%' },
  1: { left: '21%', top: '70%' },
  2: { left: '79%', top: '30%' },
  3: { left: '79%', top: '70%' },
};

/** Pairs use player IDs so each editable position can report who was tapped. */
export function CourtDiagram({ pairs, nameOf, onPlayerTap, onSeatTap, unknownLabel = 'Winners stay', seatContext }: {
  pairs: DiagramPairs;
  nameOf: (playerId: string) => string;
  onPlayerTap?: (playerId: string) => void;
  onSeatTap?: (slot: SlotIndex) => void;
  unknownLabel?: string;
  seatContext?: string;
}) {
  const spot = (playerId: string | null, slot: SlotIndex) => {
    const place = PLACE[slot];
    if (playerId === null) {
      if (!onSeatTap) return <span className="court-chip court-seat" style={place}>Open seat</span>;
      const label = `Add a player to ${seatContext ?? 'this court'}, team ${slot < 2 ? 1 : 2}, seat ${(slot % 2) + 1}`;
      return (
        <button className="court-chip court-seat" style={place} type="button" onClick={() => onSeatTap(slot)}
          aria-label={label} title={label}>
          <Icon name="plus" size={14} />
          <span>Tap to add player</span>
        </button>
      );
    }
    const name = nameOf(playerId);
    if (!onPlayerTap) return <span className="court-chip" style={place} title={name}>{name}</span>;
    return (
      <button className="court-chip" style={place} type="button" onClick={() => onPlayerTap(playerId)}
        aria-label={name + ', change or remove'} title={name}>
        {name}
      </button>
    );
  };

  return (
    <div className="court-visual">
      <span className="court-team" style={{ left: '21%' }}>Team 1</span>
      <span className="court-team" style={{ left: '79%' }}>Team 2</span>
      {spot(pairs[0][0], 0)}
      {spot(pairs[0][1], 1)}
      {pairs[1] === null ? (
        <span className="court-chip court-seat" style={{ left: '79%', top: '50%' }}>{unknownLabel}</span>
      ) : <>
        {spot(pairs[1][0], 2)}
        {spot(pairs[1][1], 3)}
      </>}
    </div>
  );
}
