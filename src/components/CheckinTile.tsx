import { useState, type CSSProperties } from 'react';

export type TileState = 'out' | 'in' | 'staged' | 'playing' | 'sitting';

export function CheckinTile({ name, state = 'out', games, onTap }: {
  name: string; state?: TileState; games?: number; onTap: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const looks: Record<TileState, CSSProperties> = {
    out: { background: pressed ? 'var(--gray-100)' : 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)' },
    in: { background: pressed ? 'var(--gray-200)' : 'var(--gray-100)', border: '1px solid var(--gray-1000)', color: 'var(--text)' },
    staged: { background: pressed ? 'var(--gray-200)' : 'var(--gray-100)', border: '1px dashed var(--gray-1000)', color: 'var(--text)' },
    playing: { background: pressed ? 'var(--primary-press)' : 'var(--primary)', border: '1px solid transparent', color: 'var(--primary-fg)' },
    sitting: { background: 'var(--bg)', border: '1px dashed var(--border-hover)', color: 'var(--text-tertiary)' },
  };
  const sub: Record<TileState, string | null> = { out: null, in: 'In', staged: 'On deck', playing: 'Playing', sitting: 'Sitting out' };
  return (
    <button
      type="button" disabled={state === 'playing'} onClick={state === 'playing' ? undefined : onTap}
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onPointerCancel={() => setPressed(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
        minHeight: 'var(--tap-primary)', padding: '8px 12px', borderRadius: 'var(--radius-control)',
        cursor: state === 'playing' ? 'default' : 'pointer', ...looks[state],
      }}>
      <span className="display" style={{ fontSize: '16px', lineHeight: 1 }}>{name}</span>
      {sub[state] ? (
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'inherit', opacity: 0.7 }}>
          {sub[state]}{typeof games === 'number' ? ` · ${games}` : ''}
        </span>
      ) : null}
    </button>
  );
}
