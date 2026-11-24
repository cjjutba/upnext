import { useState } from 'react';
import { Button } from './Button';
import { AppDialog } from './AppDialog';
import { IconButton } from './IconButton';
import type { Pairs } from '../domain/types';

function Chip({ name, selected, onTap }: { name: string; selected: boolean; onTap: () => void }) {
  return (
    <button
      type="button" className="action player-choice" data-variant="secondary" onClick={onTap} aria-pressed={selected}>
      {name}
    </button>
  );
}

/**
 * Hand-compose a court's lineup. Tap two players to swap them: two on-court
 * taps rearrange the pairs, a court tap plus a waiting tap substitutes. One
 * game-lineup-changed event fires on apply, never per tap.
 */
export function LineupEditor({ court, pairs, bench, nameOf, onApply, onClose }: {
  court: number;
  pairs: Pairs;
  /** Eligible waiting players in queue order. The reducer rejects anyone else. */
  bench: string[];
  nameOf: (playerId: string) => string;
  onApply: (pairs: Pairs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Pairs>(pairs);
  const [picked, setPicked] = useState<string | null>(null);

  const onCourt = (id: string) => draft[0].includes(id) || draft[1].includes(id);
  // benched court players lead the list: on apply the reducer returns them to the queue front
  const waiting = [
    ...[...pairs[0], ...pairs[1]].filter((id) => !onCourt(id)),
    ...bench.filter((id) => !onCourt(id)),
  ];
  const changed = JSON.stringify(draft) !== JSON.stringify(pairs);

  const tap = (id: string) => {
    if (picked === null || picked === id) {
      setPicked(picked === id ? null : id);
      return;
    }
    if (!onCourt(picked) && !onCourt(id)) {
      setPicked(id); // two waiting players have nothing to swap; move the selection
      return;
    }
    const a = picked;
    const swap = (x: string) => (x === a ? id : x === id ? a : x);
    setDraft([[swap(draft[0][0]), swap(draft[0][1])], [swap(draft[1][0]), swap(draft[1][1])]]);
    setPicked(null);
  };

  const team = (label: string, idx: 0 | 1) => (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      <span className="micro-label" style={{ width: '64px' }}>{label}</span>
      {draft[idx].map((id) => (
        <Chip key={id} name={nameOf(id)} selected={picked === id} onTap={() => tap(id)} />
      ))}
    </div>
  );

  return (
    <AppDialog label={'Edit court ' + court + ' lineup'} onClose={onClose} width="560px">
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>Court {court} lineup</span>
          <span style={{ flex: 1 }} />
          <IconButton icon="x" ariaLabel="Close lineup editor" onClick={onClose} size="sm" />
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          {team('Team 1', 0)}
          {team('Team 2', 1)}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span className="micro-label">Waiting</span>
            {waiting.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {waiting.map((id) => (
                  <Chip key={id} name={nameOf(id)} selected={picked === id} onTap={() => tap(id)} />
                ))}
              </div>
            ) : (
              <span style={{ font: '400 15px var(--font-sans)', color: 'var(--text-secondary)' }}>
                Nobody is waiting to sub in.
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            Tap two players to swap them.
          </span>
          <span style={{ flex: 1 }} />
          <Button disabled={!changed} onClick={() => { onApply(draft); onClose(); }}>Apply lineup</Button>
        </div>
    </AppDialog>
  );
}
