import { Button } from '../components/Button';
import { TimerDisplay } from '../components/TimerDisplay';
import type { Player, SessionState } from '../domain/types';
import { fmt } from './SessionBoard';

export function SessionSummary({ state, players, onExport, onDone }: {
  state: SessionState; players: Player[]; onExport: () => void; onDone: () => void;
}) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const trackWins = state.rule.template !== 'all-off';
  const rows = Object.keys(state.gamesPlayed).sort(
    (a, b) => (state.gamesPlayed[b] - state.gamesPlayed[a]) || nameOf(a).localeCompare(nameOf(b)),
  );
  const sessionSeconds = ((state.endedAt ?? Date.now()) - state.startedAt) / 1000;
  const longest = state.finishedGames.reduce((m, g) => Math.max(m, (g.endedAt - g.startedAt) / 1000), 0);
  const cols = trackWins ? '48px 1fr 96px 96px' : '48px 1fr 96px';

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: 'var(--space-5) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-6)', justifyContent: 'center', alignItems: 'flex-end' }}>
        <TimerDisplay value={fmt(sessionSeconds)} size="xl" label="Session" />
        <TimerDisplay value={fmt(longest)} size="md" muted label="Longest game" />
      </div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-2)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="micro-label">#</span>
          <span className="micro-label">Player</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>Games</span>
          {trackWins ? <span className="micro-label" style={{ textAlign: 'right' }}>Wins</span> : null}
        </div>
        {rows.map((id, i) => (
          <div key={id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-2)', alignItems: 'center', minHeight: 'var(--tap-min)', padding: '0 var(--space-4)', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{i + 1}</span>
            <span className="display" style={{ fontSize: 'var(--text-h3)' }}>{nameOf(id)}</span>
            <span className="mono" style={{ fontSize: '18px', textAlign: 'right' }}>{state.gamesPlayed[id]}</span>
            {trackWins ? <span className="mono" style={{ fontSize: '18px', textAlign: 'right', color: 'var(--text-secondary)' }}>{state.wins[id] ?? 0}</span> : null}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Button size="lg" icon="share-2" onClick={onExport}>Share summary</Button>
        <Button variant="secondary" onClick={onDone}>New session</Button>
      </div>
    </div>
  );
}
