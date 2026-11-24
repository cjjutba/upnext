import { AppDialog } from './AppDialog';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { SessionStandingsTable } from './SessionStandingsTable';
import type { Standing } from '../domain/standings';

export function StandingsModal({ rows, nameOf, onClose, onRead, canRead }: {
  rows: Standing[];
  nameOf: (playerId: string) => string;
  onClose: () => void;
  onRead: () => void;
  canRead: boolean;
}) {
  const decided = rows.some((row) => row.decided > 0);

  return (
    <AppDialog label="Live standings" onClose={onClose} width="680px">
      <header className="summary-panel-header panel-heading">
        <h2 className="display">Live standings</h2>
        <div className="board-title">
          <span className="count-label mono">{rows.length} players</span>
          <IconButton icon="x" ariaLabel="Close standings" onClick={onClose} />
        </div>
      </header>
      <SessionStandingsTable rows={rows} nameOf={nameOf} live />
      <div className="summary-panel-header panel-heading">
        <p className="setup-hint">
          {decided
            ? 'Ranked by win rate, weighted by games played. Any tiebreak appears beside the player.'
            : 'Record a score on a court to start ranking players.'}
        </p>
        <Button variant="secondary" icon="volume-2" disabled={!canRead || !decided} onClick={onRead}>
          Read top 3
        </Button>
      </div>
    </AppDialog>
  );
}
