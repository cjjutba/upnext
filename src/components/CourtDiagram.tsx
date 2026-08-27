import { useState } from 'react';
import { Icon } from './Icon';
import { SlotMenu } from './SlotMenu';
import { slotAt, type Lineup, type SlotIndex } from '../domain/types';

const SLOTS: SlotIndex[] = [0, 1, 2, 3];
/** Placement per slot index, in slotAt order: team 1 top then bottom, then team 2. */
const PLACE: Record<SlotIndex, { left: string; top: string }> = {
  0: { left: '21%', top: '29.5%' },
  1: { left: '21%', top: '70.5%' },
  2: { left: '79%', top: '29.5%' },
  3: { left: '79%', top: '70.5%' },
};

/**
 * Top-down pickleball court, true 44x20 ft proportions in a 860x420 viewBox.
 * The colors are literal by design: the court is imagery, the one sanctioned
 * exception to the monochrome UI. Slots 0 and 1 are team 1 on the left.
 *
 * The court art gets its own rounded, clipped layer so the chips and the slot
 * menu can sit unclipped above it.
 */
export function CourtDiagram({ court, lineup, nameOf, onAdd, onReplace, onRemove }: {
  court: number;
  lineup: Lineup;
  nameOf: (playerId: string) => string;
  onAdd: (slot: SlotIndex) => void;
  onReplace: (slot: SlotIndex) => void;
  onRemove: (slot: SlotIndex) => void;
}) {
  const [menuSlot, setMenuSlot] = useState<SlotIndex | null>(null);
  const open = menuSlot === null ? null : slotAt(lineup, menuSlot);

  const teamLabel = (label: string, left: string) => (
    <span style={{
      position: 'absolute', left, top: '8px', transform: 'translateX(-50%)',
      font: '600 12px/1 var(--font-sans)', color: 'rgba(255,255,255,0.9)', pointerEvents: 'none',
    }}>{label}</span>
  );

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '860 / 420' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#135a83', borderRadius: '8px', overflow: 'hidden' }}>
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
      </div>
      {teamLabel('Team 1', '21%')}
      {teamLabel('Team 2', '79%')}
      {SLOTS.map((slot) => {
        const playerId = slotAt(lineup, slot);
        return (
          <CourtSlot
            key={slot}
            place={PLACE[slot]}
            name={playerId === null ? null : nameOf(playerId)}
            label={playerId === null
              ? `Add a player to court ${court}, team ${slot < 2 ? 1 : 2}, seat ${(slot % 2) + 1}`
              : `${nameOf(playerId)} on court ${court}. Replace or remove.`}
            onTap={() => (playerId === null ? onAdd(slot) : setMenuSlot(menuSlot === slot ? null : slot))}
          />
        );
      })}
      {menuSlot !== null && open !== null ? (
        <SlotMenu
          name={nameOf(open)}
          side={menuSlot < 2 ? 'left' : 'right'}
          row={menuSlot % 2 === 0 ? 'top' : 'bottom'}
          onReplace={() => { setMenuSlot(null); onReplace(menuSlot); }}
          onRemove={() => { setMenuSlot(null); onRemove(menuSlot); }}
          onDismiss={() => setMenuSlot(null)} />
      ) : null}
    </div>
  );
}

function CourtSlot({ place, name, label, onTap }: {
  place: { left: string; top: string };
  /** null is an open seat, which reads as an invitation rather than a player. */
  name: string | null;
  label: string;
  onTap: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const filled = name !== null;
  return (
    <button
      type="button" onClick={onTap} aria-label={label} title={label}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        position: 'absolute', left: place.left, top: place.top, transform: 'translate(-50%, -50%)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
        padding: filled ? '8px 16px' : '7px 12px', cursor: 'pointer',
        background: filled
          ? (pressed ? 'rgba(23,23,23,0.98)' : 'rgba(23,23,23,0.85)')
          : (pressed ? 'rgba(23,23,23,0.55)' : 'rgba(23,23,23,0.28)'),
        color: '#ffffff',
        border: filled ? '1px solid transparent' : '1px dashed rgba(255,255,255,0.75)',
        borderRadius: 'var(--radius-full)',
        font: filled ? '600 15px/1 var(--font-sans)' : '500 13px/1 var(--font-sans)',
        whiteSpace: 'nowrap', maxWidth: filled ? '26%' : '34%', overflow: 'hidden', textOverflow: 'ellipsis',
        boxSizing: 'border-box',
      }}>
      {filled ? null : <Icon name="plus" size={14} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{filled ? name : 'Tap to add player'}</span>
    </button>
  );
}
