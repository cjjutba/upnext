import { useEffect } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { PlayerChip } from './PlayerChip';
import type { Player } from '../domain/types';

/**
 * What happens when the organizer taps a name. One modal for every surface: a
 * court chip, a queue panel chip, or a waiting row. The caller decides what
 * "swap" means, so the same picker reorders the queue or substitutes onto a
 * court without knowing which.
 */
export function PlayerPicker({ name, context, candidates, sitting, onSwap, onSit, onRemove, onLift, onClose }: {
  name: string;
  /** Where this player is right now, e.g. "Court 1" or "Waiting, position 6". */
  context: string;
  /** Everyone who could take this slot. Empty when nobody is available. */
  candidates: Player[];
  sitting: boolean;
  onSwap: (playerId: string) => void;
  onSit: () => void;
  onRemove: () => void;
  /** Live courts only: take them off and leave the seat open. Absent everywhere else. */
  onLift?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}>
      <div
        role="dialog" aria-modal="true" aria-label={'Change ' + name}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>{name}</span>
          <span className="micro-label">{context}</span>
          <span style={{ flex: 1 }} />
          <IconButton icon="x" ariaLabel="Close player options" onClick={onClose} size="sm" />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span className="micro-label">Swap in</span>
          {candidates.length === 0 ? (
            <span style={{ font: '400 15px/1.4 var(--font-sans)', color: 'var(--text-secondary)' }}>
              Nobody is waiting to take this spot.
            </span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {candidates.map((p) => (
                <PlayerChip key={p.id} name={p.name} rating={p.rating} selected={false} onClick={() => onSwap(p.id)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <Button variant="secondary" icon={sitting ? 'sun' : 'moon'} onClick={onSit}>
            {sitting ? 'Back in' : 'Sit out'}
          </Button>
          <span style={{ flex: 1 }} />
          {/* off the court but still here, which is the difference from leaving for the night */}
          {onLift ? <Button variant="secondary" icon="user-minus" onClick={onLift}>Off the court</Button> : null}
          <Button variant="secondary" icon="user-minus" onClick={onRemove}>Remove from session</Button>
        </div>
      </div>
    </div>
  );
}
