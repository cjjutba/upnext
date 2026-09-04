import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { TimerDisplay } from '../components/TimerDisplay';
import { podiumPhrase } from '../domain/announce';
import { standings, winRateLabel } from '../domain/standings';
import type { Player, SessionState } from '../domain/types';
import { fmt } from './SessionBoard';

const TOP = 10;

export function SessionSummary({ state, players, onExport, onDone, speak, canSpeak, autoRead, narrow }: {
  state: SessionState;
  players: Player[];
  onExport: () => void;
  onDone: () => void;
  speak: (text: string) => void;
  /** False while muted, when the podium button would do nothing. */
  canSpeak: boolean;
  /** True only when a live session just ended here; browsing history stays silent. */
  autoRead: boolean;
  /** Phone portrait: the fixed table columns tighten so nothing clips. */
  narrow: boolean;
}) {
  const cols = narrow ? '32px 1fr 52px 40px 40px 64px' : '48px 1fr 88px 64px 64px 88px';
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const rows = useMemo(() => standings(state, nameOf), [state, players]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, TOP);

  const sessionSeconds = ((state.endedAt ?? Date.now()) - state.startedAt) / 1000;
  const longest = state.finishedGames.reduce((m, g) => Math.max(m, (g.endedAt - g.startedAt) / 1000), 0);
  const decided = rows.some((r) => r.decided > 0);

  const readPodium = () => speak(podiumPhrase(rows, nameOf));

  // the podium reads itself once when a live end opens the screen; a re-render must not repeat it
  const readRef = useRef(false);
  useEffect(() => {
    if (!autoRead || readRef.current) return;
    readRef.current = true;
    readPodium();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: 'var(--space-5) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-6)', justifyContent: 'center', alignItems: 'flex-end' }}>
        <TimerDisplay value={fmt(sessionSeconds)} size="xl" label="Session" />
        <TimerDisplay value={fmt(longest)} size="md" muted label="Longest game" />
      </div>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="micro-label">{showAll || rows.length <= TOP ? 'Final standings' : `Top ${TOP}`}</span>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" icon="volume-2" disabled={!canSpeak || !decided} onClick={readPodium}>
            Read podium
          </Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-2)', padding: '10px var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <span className="micro-label">#</span>
          <span className="micro-label">Player</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>Games</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>W</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>L</span>
          <span className="micro-label" style={{ textAlign: 'right' }}>Win rate</span>
        </div>
        {visible.map((row, i) => (
          <div key={row.playerId} style={{
            display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-2)', alignItems: 'center',
            minHeight: 'var(--tap-min)', padding: '0 var(--space-4)',
            borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span className="mono" style={{ fontSize: row.rank <= 3 ? 'var(--text-h2)' : '14px', color: row.rank <= 3 ? 'var(--text)' : 'var(--text-secondary)' }}>
              {row.rank}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
              <span className="display" style={{ fontSize: 'var(--text-h3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nameOf(row.playerId)}
              </span>
              {row.brokenBy ? <span className="micro-label" style={{ whiteSpace: 'nowrap' }}>{row.brokenBy}</span> : null}
            </span>
            <span className="mono" style={{ fontSize: '18px', textAlign: 'right' }}>{row.games}</span>
            <span className="mono" style={{ fontSize: '18px', textAlign: 'right' }}>{row.wins}</span>
            <span className="mono" style={{ fontSize: '18px', textAlign: 'right', color: 'var(--text-secondary)' }}>{row.losses}</span>
            <span className="mono" style={{ fontSize: '18px', textAlign: 'right', color: 'var(--text-secondary)' }}>{winRateLabel(row)}</span>
          </div>
        ))}
        {rows.length > TOP ? (
          <div style={{ borderTop: '1px solid var(--border)', padding: 'var(--space-2) var(--space-3)' }}>
            <Button variant="ghost" block onClick={() => setShowAll(!showAll)}>
              {showAll ? `Show top ${TOP}` : `Show all ${rows.length} players`}
            </Button>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <Button size="lg" icon="share-2" onClick={onExport}>Share summary</Button>
        <Button variant="secondary" onClick={onDone}>New session</Button>
      </div>
    </div>
  );
}
