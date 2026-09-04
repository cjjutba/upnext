import { useEffect } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { StatusBadge } from './StatusBadge';
import { winRateLabel, type Standing } from '../domain/standings';

const COLS = '44px 1fr 56px 44px 44px 76px';

export function StandingsModal({ rows, nameOf, onClose, onRead, canRead }: {
  rows: Standing[];
  nameOf: (playerId: string) => string;
  onClose: () => void;
  onRead: () => void;
  /** False while muted, when reading the top three aloud would do nothing. */
  canRead: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decided = rows.some((r) => r.decided > 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'var(--overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}>
      <div
        role="dialog" aria-modal="true" aria-label="Live standings"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '680px', maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>Live standings</span>
          <span className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{rows.length} players</span>
          <span style={{ flex: 1 }} />
          <IconButton icon="x" ariaLabel="Close standings" onClick={onClose} size="sm" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 'var(--space-2)', padding: '10px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="micro-label">#</span>
          <span className="micro-label">Player</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>Games</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>W</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>L</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>Win rate</span>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', font: '400 15px var(--font-sans)', color: 'var(--text-secondary)' }}>
              Nobody has checked in yet.
            </div>
          ) : null}
          {rows.map((row, i) => (
            <div key={row.playerId} style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 'var(--space-2)', alignItems: 'center',
              minHeight: 'var(--tap-min)', padding: '0 var(--space-4)',
              borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span className="mono" style={{ fontSize: row.rank <= 3 ? '20px' : '14px', color: row.rank <= 3 ? 'var(--text)' : 'var(--text-tertiary)' }}>
                {row.rank}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <span className="display" style={{ fontSize: 'var(--text-h3)', color: row.departed ? 'var(--text-tertiary)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nameOf(row.playerId)}
                </span>
                {row.departed ? <StatusBadge status="neutral" label="Left" /> : null}
                {!row.departed && row.streak >= 2 ? <StatusBadge status="live" label={`${row.streak} in a row`} /> : null}
                {row.brokenBy ? <span className="micro-label" style={{ whiteSpace: 'nowrap' }}>{row.brokenBy}</span> : null}
              </span>
              <span className="mono" style={{ fontSize: '16px', textAlign: 'right' }}>{row.games}</span>
              <span className="mono" style={{ fontSize: '16px', textAlign: 'right' }}>{row.wins}</span>
              <span className="mono" style={{ fontSize: '16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{row.losses}</span>
              <span className="mono" style={{ fontSize: '16px', textAlign: 'right', color: 'var(--text-secondary)' }}>{winRateLabel(row)}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-tertiary)' }}>
            {decided
              ? 'Ranked by win rate, weighted by games played. The note beside a name is what broke the tie.'
              : 'Pick a winner on a court to start the table.'}
          </span>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" icon="volume-2" disabled={!canRead || !decided} onClick={onRead}>
            Read top 3
          </Button>
        </div>
      </div>
    </div>
  );
}
