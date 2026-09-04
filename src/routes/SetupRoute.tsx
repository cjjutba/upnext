import { useEffect, useState } from 'react';
import { RosterSetup } from '../screens/RosterSetup';
import { importSessionFile } from '../lib/exportFile';
import { lastSessionAttendees } from '../db/eventStore';
import type { Player, RuleTemplate } from '../domain/types';

interface SetupRouteProps {
  players: Player[];
  onAddPlayer: (name: string) => void;
  onUpdatePlayer: (id: string, changes: { name?: string; rating?: number }) => void;
  onStart: (config: { courts: number; template: RuleTemplate; winCap: number }, selectedIds: string[]) => void;
  onResume: (sessionId: string) => void;
  onReopen: (sessionId: string) => void;
  onView: (sessionId: string) => void;
  narrow: boolean;
}

export function SetupRoute({
  players, onAddPlayer, onUpdatePlayer, onStart, onResume, onReopen, onView, narrow,
}: SetupRouteProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [returningIds, setReturningIds] = useState<string[]>([]);

  useEffect(() => {
    void lastSessionAttendees().then(setReturningIds);
  }, []);

  const returning = players.filter((p) => returningIds.includes(p.id) && !selected.includes(p.id));

  return (
    <RosterSetup
      players={players}
      onAddPlayer={onAddPlayer}
      selected={selected}
      onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
      onStart={(config) => onStart(config, selected)}
      onResume={onResume}
      onReopen={onReopen}
      onView={onView}
      onImport={(file) => void importSessionFile(file).then(() => window.location.reload()).catch(() => window.alert('Import failed: that is not a valid upnext session file'))}
      onSelectAll={() => setSelected(players.map((p) => p.id))}
      onClearAll={() => setSelected([])}
      returning={returning}
      onCheckInReturning={() => setSelected((s) => [...s, ...returning.map((p) => p.id)])}
      onUpdatePlayer={onUpdatePlayer}
      narrow={narrow}
    />
  );
}
