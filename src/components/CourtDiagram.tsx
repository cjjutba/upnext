import { useState } from 'react';
import { Icon } from './Icon';
import type { Lineup, SlotIndex, SlotPair } from '../domain/types';

/** A four, a four with open seats, or a pair whose opponents are not decided yet. */
export type DiagramPairs = Lineup | [SlotPair, null];

/** Placement per slot index: team 1 top then bottom, then team 2. */
const PLACE: Record<SlotIndex, { left: string; top: string }> = {
  0: { left: '21%', top: '29.5%' },
  1: { left: '21%', top: '70.5%' },
  2: { left: '79%', top: '29.5%' },
  3: { left: '79%', top: '70.5%' },
};

/**
 * Top-down pickleball court, true 44x20 ft proportions in a 860x420 viewBox.
 * The colors are literal by design: the court is imagery, the one sanctioned
 * exception to the monochrome UI. pairs[0] is team 1 on the left.
 *
 * Takes player ids plus a name lookup rather than names, so a tapped chip can
 * report who it is. With onPlayerTap the chips become buttons. A null second
 * pair draws a placeholder instead: the winners templates know the two
 * challengers long before they know who those two are playing. A null inside a
 * pair is an open seat on a live court, which onSeatTap turns into an invitation.
 */
export function CourtDiagram({ pairs, nameOf, onPlayerTap, onSeatTap, unknownLabel = 'Winners stay', seatContext }: {
  pairs: DiagramPairs;
  nameOf: (playerId: string) => string;
  /** Opens the picker for that player. Chips are plain text when this is absent. */
  onPlayerTap?: (playerId: string) => void;
  /** Opens the seat filler. Open seats are inert text when this is absent. */
  onSeatTap?: (slot: SlotIndex) => void;
  /** Drawn across team 2 when its pair is null. */
  unknownLabel?: string;
  /** Names the court in an open seat's label, e.g. "court 1". */
  seatContext?: string;
}) {
  const [down, setDown] = useState<string | null>(null);

  const chip = (playerId: string, place: { left: string; top: string }) => {
    const name = nameOf(playerId);
    const look = {
      position: 'absolute' as const, left: place.left, top: place.top, transform: 'translate(-50%, -50%)',
      background: down === playerId ? '#ffffff' : 'rgba(23,23,23,0.85)',
      color: down === playerId ? '#171717' : '#ffffff',
      padding: '8px 16px', borderRadius: 'var(--radius-full)', font: '600 15px/1 var(--font-sans)',
      whiteSpace: 'nowrap' as const, maxWidth: '26%', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' as const,
    };
    if (!onPlayerTap) return <span key={playerId} style={look}>{name}</span>;
    return (
      <button
        key={playerId} type="button" onClick={() => onPlayerTap(playerId)}
        aria-label={name + ', change or remove'}
        onPointerDown={() => setDown(playerId)} onPointerUp={() => setDown(null)}
        onPointerLeave={() => setDown(null)} onPointerCancel={() => setDown(null)}
        style={{ ...look, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer' }}>
        {name}
      </button>
    );
  };

  const seat = (slot: SlotIndex) => {
    const key = 'seat-' + slot;
    const place = PLACE[slot];
    const look = {
      position: 'absolute' as const, left: place.left, top: place.top, transform: 'translate(-50%, -50%)',
      display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: '4px',
      background: down === key ? 'rgba(23,23,23,0.55)' : 'rgba(23,23,23,0.28)', color: '#ffffff',
      border: '1px dashed rgba(255,255,255,0.75)', padding: '7px 12px', borderRadius: 'var(--radius-full)',
      font: '500 13px/1 var(--font-sans)', whiteSpace: 'nowrap' as const,
      maxWidth: '34%', overflow: 'hidden', textOverflow: 'ellipsis', boxSizing: 'border-box' as const,
    };
    const label = `Add a player to ${seatContext ?? 'this court'}, team ${slot < 2 ? 1 : 2}, seat ${(slot % 2) + 1}`;
    if (!onSeatTap) return <span key={key} style={look}>Open seat</span>;
    return (
      <button
        key={key} type="button" onClick={() => onSeatTap(slot)} aria-label={label} title={label}
        onPointerDown={() => setDown(key)} onPointerUp={() => setDown(null)}
        onPointerLeave={() => setDown(null)} onPointerCancel={() => setDown(null)}
        style={{ ...look, cursor: 'pointer' }}>
        <Icon name="plus" size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Tap to add player</span>
      </button>
    );
  };

  const spot = (playerId: string | null, slot: SlotIndex) => (playerId === null ? seat(slot) : chip(playerId, PLACE[slot]));

  const placeholder = (
    <span style={{
      position: 'absolute', left: '79%', top: '50%', transform: 'translate(-50%, -50%)',
      background: 'rgba(255,255,255,0.15)', border: '1px dashed rgba(255,255,255,0.6)',
      color: '#ffffff', padding: '8px 16px', borderRadius: 'var(--radius-full)',
      font: '500 14px/1 var(--font-sans)', whiteSpace: 'nowrap',
    }}>{unknownLabel}</span>
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
      {spot(pairs[0][0], 0)}
      {spot(pairs[0][1], 1)}
      {pairs[1] === null ? placeholder : (
        <>
          {spot(pairs[1][0], 2)}
          {spot(pairs[1][1], 3)}
        </>
      )}
    </div>
  );
}
