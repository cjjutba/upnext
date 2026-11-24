export type TileState = 'out' | 'in' | 'staged' | 'playing' | 'sitting';

export function CheckinTile({ name, state = 'out', games, onTap }: {
  name: string; state?: TileState; games?: number; onTap: () => void;
}) {
  const sub: Record<TileState, string | null> = { out: null, in: 'In', staged: 'On deck', playing: 'Playing', sitting: 'Sitting out' };
  return (
    <button
      type="button" className="checkin-tile" data-state={state} disabled={state === 'playing'} onClick={onTap}>
      <span className="display" style={{ fontSize: '14px', lineHeight: 1.15, overflowWrap: 'anywhere', maxWidth: '100%' }}>{name}</span>
      {sub[state] ? (
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'inherit', textAlign: 'center' }}>
          {sub[state]}{typeof games === 'number' ? ` · ${games}` : ''}
        </span>
      ) : null}
    </button>
  );
}
