import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AppDialog } from './AppDialog';
import { Button } from './Button';
import type { Pairs } from '../domain/types';

function readPoints(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const points = Number(raw);
  return Number.isSafeInteger(points) ? points : null;
}

export function OpenPlayScoreDialog({ court, pairs, nameOf, onSave, onClose }: {
  court: number;
  pairs: Pairs;
  nameOf: (id: string) => string;
  onSave: (team1Points: number, team2Points: number) => Promise<boolean>;
  onClose: (saved: boolean) => void;
}) {
  const descriptionId = useId();
  const errorId = useId();
  const teamId = useId();
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [error, setError] = useState<{ message: string; fields?: [boolean, boolean] } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const inputs = [team1, team2];
  const setters = [setTeam1, setTeam2];

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    const left = readPoints(team1);
    const right = readPoints(team2);
    if (left === null || right === null) {
      setError({ message: 'Enter a whole number of 0 or more for each team.', fields: [left === null, right === null] });
      event.currentTarget.querySelectorAll('input')[left === null ? 0 : 1]?.focus();
      return;
    }
    if (left === right) {
      setError({ message: 'Final scores must have a winner. Enter a different score for one team.', fields: [true, true] });
      return;
    }
    setError(null);
    saving.current = true;
    setBusy(true);
    try {
      if (await onSave(left, right)) {
        onClose(true);
      } else {
        setError({ message: 'This match or its lineup changed. Close this dialog and open Record score again.' });
      }
    } catch {
      setError({ message: 'The score could not be saved. Check the court before trying again.' });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const label = `Record score for Court ${court}`;
  return (
    <AppDialog label={label} descriptionId={descriptionId} busy={busy} dismissOnBackdrop={false} onClose={() => onClose(false)}>
      <form className="open-play-score" onSubmit={(event) => void save(event)}>
        <h2 className="display">{label}</h2>
        <p id={descriptionId} className="setup-hint">Enter the final points for both teams.</p>
        <div className="open-play-score-fields">
          {pairs.map((pair, side) => (
            <label key={side}>
              <span id={`${teamId}-score-${side}`} className="micro-label">Team {side + 1} score</span>
              <strong id={`${teamId}-players-${side}`}>{pair.map(nameOf).join(' and ')}</strong>
              <input
                type="text" inputMode="numeric" autoComplete="off" name={`team-${side + 1}-points`}
                className="mono" value={inputs[side]} readOnly={busy}
                aria-labelledby={`${teamId}-score-${side} ${teamId}-players-${side}`}
                aria-invalid={error?.fields?.[side] || undefined}
                aria-describedby={error?.fields?.[side] ? errorId : undefined}
                onChange={(event) => { setters[side](event.target.value); setError(null); }}
              />
            </label>
          ))}
        </div>
        {error ? <p id={errorId} className="app-notice" data-kind="error" role="alert">{error.message}</p> : null}
        <div className="open-play-score-actions">
          <Button variant="secondary" disabled={busy} onClick={() => onClose(false)}>Cancel</Button>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Saving…' : 'Save score'}</Button>
        </div>
      </form>
    </AppDialog>
  );
}
