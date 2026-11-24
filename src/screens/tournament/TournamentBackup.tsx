import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { muted, Panel, row, stack, TournamentDialog } from '../../components/tournament/controls';

interface BackupPreview {
  data: unknown;
  name: string;
  time: string;
}

export function downloadTournamentBackup(backup: unknown): void {
  const day = new Date().toISOString().slice(0, 10);
  const file = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `upnext-tournament-${day}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TournamentBackup({ hasTournament, busy, error, onSave, onRestore, onRead }: {
  hasTournament: boolean; busy: boolean; error: string | null; onSave: () => Promise<boolean>;
  onRestore: (data: unknown) => Promise<boolean>; onRead: (file: File) => Promise<BackupPreview>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [localError, setLocalError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [reading, setReading] = useState(false);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setNotice(undefined);
    setLocalError(undefined);
    setReading(true);
    try {
      setPreview(await onRead(file));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'This backup could not be read.');
    } finally {
      setReading(false);
    }
  };

  return <Panel title="Tournament backup">
    <p style={muted}>Save a JSON file after locking draws and during play. Keep a copy outside this browser before clearing its data or changing devices.</p>
    <div style={row}>
      {hasTournament ? <Button size="lg" icon="download" disabled={busy || reading} onClick={async () => {
        setNotice(undefined);
        if (await onSave()) setNotice('Backup download started.');
      }}>Save backup</Button> : null}
      <Button variant="secondary" disabled={busy || reading} onClick={() => fileInput.current?.click()}>Restore backup</Button>
      <input ref={fileInput} type="file" hidden accept=".json,application/json" onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        void read(file);
      }} />
    </div>
    {reading ? <p role="status" style={muted}>Reading backup.</p> : null}
    {notice ? <p role="status" style={muted}>{notice}</p> : null}
    {localError ? <p role="alert" style={muted}>{localError}</p> : null}
    {preview ? <TournamentDialog title="Restore tournament backup" busy={busy} onClose={() => setPreview(null)}>
      <div style={{ ...stack, overflowWrap: 'anywhere' }}>
        <strong>{preview.name}</strong>
        <p style={muted}>{preview.time}</p>
        <p style={muted}>Upnext checks the file before restoring it. Existing tournament results are kept when a backup conflicts.</p>
      </div>
      {error ? <p role="alert" style={muted}>{error}</p> : null}
      <Button size="lg" disabled={busy} onClick={async () => {
        if (await onRestore(preview.data)) {
          setNotice('Tournament restored.');
          setPreview(null);
        }
      }}>Confirm restore</Button>
    </TournamentDialog> : null}
  </Panel>;
}
