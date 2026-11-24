import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { TimerDisplay } from '../components/TimerDisplay';
import { SessionStandingsTable } from '../components/SessionStandingsTable';
import { podiumPhrase } from '../domain/announce';
import { standings } from '../domain/standings';
import type { Player, SessionState } from '../domain/types';
import { fmt } from './SessionBoard';

const TOP = 10;

export function SessionSummary({ state, players, onExport, onDone, speak, canSpeak, autoRead }: {
  state: SessionState;
  players: Player[];
  onExport: () => void;
  onDone: () => void;
  speak: (text: string) => void;
  /** False while muted, when the podium button would do nothing. */
  canSpeak: boolean;
  /** True only when a live session just ended here; browsing history stays silent. */
  autoRead: boolean;
}) {
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
    <main id="app-main" tabIndex={-1} className="session-summary">
      <h1 className="display">Session summary</h1>
      <div className="summary-metrics">
        <TimerDisplay value={fmt(sessionSeconds)} size="md" label="Session time" />
        <TimerDisplay value={fmt(longest)} size="md" label="Longest game" />
        <TimerDisplay value={String(state.finishedGames.length)} size="md" label="Games played" />
      </div>
      <section className="summary-panel" aria-labelledby="summary-ranks">
        <header className="summary-panel-header panel-heading">
          <h2 className="display" id="summary-ranks">{showAll || rows.length <= TOP ? 'Final standings' : `Top ${TOP}`}</h2>
          <Button variant="secondary" icon="volume-2" disabled={!canSpeak || !decided} onClick={readPodium}>
            Read podium
          </Button>
        </header>
        <SessionStandingsTable rows={visible} nameOf={nameOf} />
        {rows.length > TOP ? (
          <div className="summary-panel-header">
            <Button variant="ghost" block onClick={() => setShowAll(!showAll)}>
              {showAll ? `Show top ${TOP}` : `Show all ${rows.length} players`}
            </Button>
          </div>
        ) : null}
      </section>
      <div className="summary-actions">
        <Button size="lg" icon="share-2" onClick={onExport}>Share summary</Button>
        <Button variant="secondary" onClick={onDone}>New session</Button>
      </div>
    </main>
  );
}
