import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * The two things you can do to a player already on court. Anchored to the
 * corner of the court half the chip sits in, so it never leaves the card.
 */
export function SlotMenu({ name, side, row, onReplace, onRemove, onDismiss }: {
  name: string;
  side: 'left' | 'right';
  row: 'top' | 'bottom';
  onReplace: () => void;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor: CSSProperties = {
    left: side === 'left' ? '6%' : undefined,
    right: side === 'right' ? '6%' : undefined,
    top: row === 'top' ? '44%' : undefined,
    bottom: row === 'bottom' ? '44%' : undefined,
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref} aria-label={'Options for ' + name}
      style={{
        position: 'absolute', zIndex: 25, ...anchor,
        width: '208px', maxWidth: '80%', padding: 'var(--space-1)',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-menu)',
        display: 'flex', flexDirection: 'column',
      }}>
      <span className="micro-label" style={{
        padding: '8px var(--space-3) 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
      <MenuItem icon="repeat" label="Replace player" onClick={onReplace} />
      <MenuItem icon="user-minus" label="Remove from court" onClick={onRemove} />
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', textAlign: 'left',
        minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', cursor: 'pointer',
        background: pressed ? 'var(--gray-100)' : 'transparent', color: 'var(--text)',
        border: '1px solid transparent', borderRadius: 'var(--radius-control)',
        font: '500 15px/1 var(--font-sans)',
      }}>
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}
