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
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [returningIds, setReturningIds] = useState<string[]>([]);

  useEffect(() => {
    void lastSessionAttendees().then(setReturningIds);
  }, []);

  const returning = players.filter((p) => returningIds.includes(p.id) && !selected.includes(p.id));

  const importSession = async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      await importSessionFile(file);
      window.location.reload();
    } catch {
      setImportError('This file could not be imported. Choose an Upnext open play session export.');
      setImporting(false);
    }
  };

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
      onImport={(file) => void importSession(file)}
      importError={importError}
      importing={importing}
      onSelectAll={() => setSelected(players.map((p) => p.id))}
      onClearAll={() => setSelected([])}
      returning={returning}
      onCheckInReturning={() => setSelected((s) => [...s, ...returning.map((p) => p.id)])}
      onUpdatePlayer={onUpdatePlayer}
      narrow={narrow}
    />
  );
}
