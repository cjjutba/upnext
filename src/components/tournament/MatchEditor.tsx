import { useState } from 'react';
import type { QualifierResolution, MatchResult, ScoreFormat, TournamentMatch } from '../../domain/tournament';
import { Button } from '../Button';
import { Choices, control, Field, muted, row, stack, TournamentDialog } from './controls';

export interface CorrectionConflict {
  message: string;
  affectedMatches: string[];
}

export function ResolveAffectedMatch({ conflict, resolution, onChange }: {
  conflict: CorrectionConflict; resolution: QualifierResolution | undefined; onChange: (resolution: QualifierResolution) => void;
}) {
  const [policy, setPolicy] = useState<QualifierResolution['policy'] | ''>(resolution?.policy ?? '');
  const [reason, setReason] = useState(resolution?.reason ?? '');

  const change = (next: typeof policy, explanation: string) => {
    setPolicy(next);
    setReason(explanation);
    if (next) onChange({ policy: next, reason: explanation });
  };

  return <fieldset style={{ ...stack, margin: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: 'var(--space-2)' }}>
    <legend style={{ fontWeight: 600 }}>Resolve affected match</legend>
    <p style={muted}>{conflict.message}</p>
    {conflict.affectedMatches.length ? <ul style={{ margin: 0, paddingInlineStart: 'var(--space-4)' }}>
      {conflict.affectedMatches.map((match) => <li key={match}>{match}</li>)}
    </ul> : null}
    <Field label="Resolution"><select style={control} value={policy} onChange={(e) => change(e.target.value as typeof policy, reason)}>
      <option value="" disabled>Choose a resolution</option>
      <option value="keep-started">Keep the started pairings</option>
      <option value="reset-affected">Reset affected matches</option>
    </select></Field>
    {policy === 'reset-affected' ? <p style={muted}>Reset clears the court, start and result of affected matches. Replay those matches with the corrected qualifiers.</p> : null}
    {policy === 'keep-started' ? <p style={muted}>Keep the pairings that already started and record why they differ from the updated standings.</p> : null}
    <Field label="Resolution reason"><input style={control} value={reason} onChange={(e) => change(policy, e.target.value)} /></Field>
  </fieldset>;
}

interface PairingPreview {
  error?: string;
  affectedMatches: string[];
  changes: { label: string; before: string; after: string }[];
}

export function MatchEditor({ match, teams, format, scoringRule, busy, error, conflict, onClose, onSave, onReview, forfeitOnly }: {
  match: TournamentMatch; teams: [string, string]; format: ScoreFormat; scoringRule: string; busy: boolean;
  error: string | null; conflict: CorrectionConflict | null; onClose: () => void; forfeitOnly?: boolean;
  onSave: (result: MatchResult, reason: string, resolution?: QualifierResolution) => Promise<boolean>;
  onReview?: (result: MatchResult, reason: string, resolution?: QualifierResolution) => PairingPreview;
}) {
  const [kind, setKind] = useState<'played' | 'forfeit'>(forfeitOnly || match.result?.type === 'forfeit' ? 'forfeit' : 'played');
  const [scores, setScores] = useState<[string, string][]>(match.result?.type === 'played'
    ? match.result.games.map(([a, b]) => [String(a), String(b)]) : [['', '']]);
  const [winner, setWinner] = useState(match.result?.type === 'forfeit' ? String(match.result.winner) : '');
  const [forfeitReason, setForfeitReason] = useState(match.result?.type === 'forfeit' ? match.result.reason : '');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<QualifierResolution>();
  const [review, setReview] = useState<{ signature: string; output: PairingPreview }>();
  const signature = JSON.stringify({ kind, scores, winner, forfeitReason, reason });
  const currentReview = review?.signature === signature ? review.output : undefined;
  const pendingConflict = conflict ?? (currentReview?.affectedMatches.length
    ? { message: 'A corrected result would change a playoff pairing that already started or has a result.', affectedMatches: currentReview.affectedMatches }
    : null);
  const editing = match.resultEventId !== null;
  const canSubmit = kind === 'played'
    ? scores.every((score) => score.every((point) => point !== '' && Number.isSafeInteger(Number(point)) && Number(point) >= 0))
    : !!forfeitReason.trim() && (winner === '0' || winner === '1');

  const save = async () => {
    if (!canSubmit) return;
    const result: MatchResult = kind === 'played'
      ? { type: 'played', games: scores.map(([a, b]) => [Number(a), Number(b)]) }
      : { type: 'forfeit', winner: winner === '0' ? 0 : 1, reason: forfeitReason.trim() };
    const choice = pendingConflict && resolution?.reason.trim() ? { ...resolution, reason: resolution.reason.trim() } : undefined;
    if (onReview && !currentReview) {
      const output = onReview(result, reason.trim(), choice);
      setReview({ signature, output });
      return;
    }
    if (await onSave(result, reason.trim(), choice)) {
      onClose();
    }
  };

  return <TournamentDialog title={editing ? 'Edit result' : forfeitOnly ? 'Record forfeit' : 'Record score'} onClose={onClose} busy={busy}>
    <p style={muted}>{scoringRule}</p>
    {!forfeitOnly ? <Choices label="Result type" value={kind} options={[
      { value: 'played', label: 'Game scores' }, { value: 'forfeit', label: 'Forfeit' },
    ]} onChange={setKind} /> : null}
    <fieldset disabled={busy} style={{ ...stack, minWidth: 0, padding: 0, margin: 0, border: 0 }}>
      {kind === 'played' ? <>
        {scores.map((score, game) => <fieldset className="score-game" key={game} style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)',
          padding: 'var(--space-2)', border: '1px solid var(--border)', margin: 0, minWidth: 0, overflowWrap: 'anywhere',
        }}>
          <legend className="mono">Game {game + 1}</legend>
          {teams.map((team, side) => <Field key={side} label={team}>
            <input type="number" min={0} inputMode="numeric" aria-label={`Game ${game + 1}, ${team} points`} className="mono"
              style={{ ...control, minHeight: 'var(--tap-primary)', font: '650 24px var(--font-sans)' }}
              value={score[side]} onChange={(e) => {
                const values: [string, string] = [...score];
                values[side] = e.target.value;
                setScores(scores.map((current, i) => i === game ? values : current));
              }} />
          </Field>)}
        </fieldset>)}
        {format.gamesToWin > 1 ? <div style={row}>
          <Button variant="secondary" disabled={scores.length >= format.gamesToWin * 2 - 1}
            onClick={() => setScores([...scores, ['', '']])}>Add game</Button>
          <Button variant="secondary" disabled={scores.length <= 1}
            onClick={() => setScores(scores.slice(0, -1))}>Remove last game</Button>
        </div> : null}
      </> : <>
        <Field label="Forfeit winner"><select style={control} value={winner} onChange={(e) => setWinner(e.target.value)}>
          <option value="">Choose the side that advances</option>
          {teams.map((team, side) => <option key={side} value={side}>{team}</option>)}
        </select></Field>
        <Field label="Forfeit reason"><input style={control} value={forfeitReason} onChange={(e) => setForfeitReason(e.target.value)} /></Field>
        <p style={muted}>A forfeit records a match winner without game scores.</p>
      </>}
      {editing ? <Field label="Correction reason"><input value={reason} style={control} onChange={(e) => setReason(e.target.value)} /></Field> : null}
      {(error && !pendingConflict) || currentReview?.error ? <p role="alert" className="app-notice" data-kind="error">{currentReview?.error ?? error}</p> : null}
      {currentReview?.changes.length ? <section aria-label="Updated playoff pairings" className="correction-impact">
        <strong>Playoff pairing changes</strong>
        {currentReview.changes.map((change) => <div key={change.label} style={{ ...stack, gap: 'var(--space-1)' }}>
          <strong>{change.label}</strong>
          <dl className="correction-diff">
            <div><dt>Before</dt><dd>{change.before}</dd></div>
            <div><dt>With the correction</dt><dd>{change.after}</dd></div>
          </dl>
        </div>)}
      </section> : null}
      {currentReview && !currentReview.error && !currentReview.changes.length && !currentReview.affectedMatches.length ? (
        <p role="status" className="app-notice">This correction leaves the playoff pairings as they are.</p>
      ) : null}
      {pendingConflict ? <ResolveAffectedMatch conflict={pendingConflict} resolution={resolution} onChange={setResolution} /> : null}
      <Button size="lg" disabled={busy || !canSubmit || (editing && !reason.trim()) || (!!pendingConflict && !resolution?.reason.trim()) || !!currentReview?.error}
        onClick={() => void save()}>{onReview && !currentReview ? 'Review correction' : editing ? 'Save correction' : 'Save result'}</Button>
    </fieldset>
  </TournamentDialog>;
}
