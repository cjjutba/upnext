import { useEffect, useState } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { CheckinTile, type TileState } from './CheckinTile';

interface Section {
  label: string;
  hint: string;
  ids: string[];
  tile: TileState;
}

/**
 * Who can take an open seat. Waiting players come first, because that is
 * usually the answer. The picker leaves out anyone already on a court.
 */
export function PlayerPickerModal({
  title, waiting, sittingOut, notCheckedIn, nameOf, gamesOf, onPick, onCreate, onClose,
}: {
  title: string;
  /** Queue order, front first. */
  waiting: string[];
  sittingOut: string[];
  notCheckedIn: string[];
  nameOf: (playerId: string) => string;
  gamesOf: (playerId: string) => number;
  onPick: (playerId: string) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections: Section[] = ([
    { label: 'Waiting', hint: 'Front of the queue first.', ids: waiting, tile: 'in' },
    { label: 'Sitting out', hint: 'Picking one brings them back in.', ids: sittingOut, tile: 'sitting' },
    { label: 'Not checked in', hint: 'Picking one checks them in first.', ids: notCheckedIn, tile: 'out' },
  ] as Section[]).filter((s) => s.ids.length > 0);

  const create = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName('');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px', maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>{title}</span>
          <span style={{ flex: 1 }} />
          <IconButton icon="x" ariaLabel="Close player picker" onClick={onClose} size="sm" />
        </div>

        <form
          style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}
          onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="New player name" aria-label="New player name"
            style={{
              flex: 1, minWidth: 0, height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
            }} />
          <Button variant="secondary" icon="user-plus" onClick={create}>Add and seat</Button>
        </form>

        <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
          {sections.length === 0 ? (
            <div style={{ font: '400 15px/1.4 var(--font-sans)', color: 'var(--text-secondary)' }}>
              Everyone in the roster is already on a court. Add a new player above.
            </div>
          ) : null}
          {sections.map((s) => (
            <section key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <span className="micro-label">{s.label}</span>
                <span style={{ font: '400 13px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>{s.hint}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {s.ids.map((id) => (
                  <CheckinTile key={id} name={nameOf(id)} state={s.tile} games={gamesOf(id)} onTap={() => onPick(id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
