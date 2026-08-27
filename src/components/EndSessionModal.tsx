import { useEffect } from 'react';
import { Button } from './Button';

const TITLE = 'Are you sure you want to end the session?';

/** "Court 1", "Court 1 and Court 3", "Court 1, Court 2, and Court 3". */
function courtList(courts: number[]): string {
  const names = courts.map((c) => `Court ${c}`);
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Confirms the one action that closes the log. The organizer taps this on a
 * courtside screen, so the modal says what is still running rather than asking
 * a bare yes or no.
 */
export function EndSessionModal({ liveCourts, gamesPlayed, elapsed, onCancel, onConfirm }: {
  /** Court numbers with a game running right now. Drives the warning block. */
  liveCourts: number[];
  gamesPlayed: number;
  /** Already formatted, because the caller owns the clock. */
  elapsed: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const line = (text: string) => (
    <span key={text} style={{ font: '400 15px/1.5 var(--font-sans)', color: 'var(--text-secondary)' }}>{text}</span>
  );

  const played = gamesPlayed === 0
    ? 'No games recorded yet.'
    : `${gamesPlayed} ${gamesPlayed === 1 ? 'game' : 'games'} recorded so far.`;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 45, background: 'var(--overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}>
      <div
        role="dialog" aria-modal="true" aria-label={TITLE}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>{TITLE}</span>
          {line('This closes the log and takes you to the final standings.')}
          {liveCourts.length > 0 ? (
            <div style={{ padding: 'var(--space-3)', background: 'var(--status-amber-bg)', borderRadius: 'var(--radius-card)' }}>
              <span style={{ font: '400 15px/1.5 var(--font-sans)', color: 'var(--status-amber-text)' }}>
                {`${courtList(liveCourts)} ${liveCourts.length === 1 ? 'is' : 'are'} still playing. `}
                {liveCourts.length === 1 ? 'That game ends' : 'Those games end'} without a winner recorded.
              </span>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-card)' }}>
            {line(played)}
            {line(`Session time ${elapsed}.`)}
            {line('You can reopen this session from history if you end it early.')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onCancel}>Keep playing</Button>
          <Button variant="danger" onClick={onConfirm}>End session</Button>
        </div>
      </div>
    </div>
  );
}
