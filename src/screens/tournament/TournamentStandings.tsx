import { useState } from 'react';
import type {
  DivisionId, DivisionStandings, QualifierResolution, RankingEvidence, Standing, TieResolution, TournamentAction, TournamentDivision,
} from '../../domain/tournament';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { Choices, control, Disclosure, Field, grid, muted, Panel, row, stack, TournamentDialog } from '../../components/tournament/controls';
import { ResolveAffectedMatch } from '../../components/tournament/MatchEditor';
import type { CorrectionConflict } from '../../components/tournament/MatchEditor';
import { divisionNames, divisionOptions, tieRuleText } from './presentation';
import { MatchRecord } from './TournamentPlay';
import type { FixtureView } from './TournamentPlay';

const metricNames: Record<RankingEvidence['metric'], string> = {
  wins: 'Wins', 'head-to-head': 'Head-to-head', 'opponents-win-rate': "Opponents' win rate",
  'point-differential': 'Point differential', 'tie-playoff': 'Tie playoff',
};

function metricValue(evidence: RankingEvidence): string {
  if (evidence.value === null) return 'Skipped';
  const value = evidence.value;
  if (evidence.metric === 'opponents-win-rate') return new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  if (evidence.metric === 'point-differential') return value > 0 ? `+${value}` : String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function RankingRow({ standing, label, fixtures, matchRef }: {
  standing: Standing; label: string; fixtures: Map<string, FixtureView>; matchRef: (id: string) => string;
}) {
  const finalMetric = standing.evidence.findLast((item) => item.value !== null && item.metric !== 'wins');
  return <li className="tournament-ranking">
    <div style={{ ...row, justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', overflowWrap: 'anywhere', minWidth: 0 }}>
        {standing.withdrawn ? null : <span className="rank-place mono" aria-label={`Place ${standing.place}`}>{standing.place}</span>}
        <strong>{label}</strong>
      </div>
      <div style={row}>
        {standing.joint ? <StatusBadge label="Tied" /> : null}
        {standing.withdrawn ? <StatusBadge label="Withdrawn" /> : null}
      </div>
    </div>
    <p style={muted}><span className="mono">{standing.wins}</span> {standing.wins === 1 ? 'win' : 'wins'} from <span className="mono">{standing.played}</span> played. {standing.scored ? <>Point differential <span className="mono">{standing.pointDifferential > 0 ? '+' : ''}{standing.pointDifferential}</span>.</> : 'No game scores yet.'}</p>
    {finalMetric && finalMetric.metric !== 'point-differential' ? <p style={muted}>
      {metricNames[finalMetric.metric]} <span className="mono">{metricValue(finalMetric)}</span>.
    </p> : null}
    <Disclosure title="Why this rank?">
      {standing.evidence.map((evidence) => (
        <div key={evidence.metric} style={stack}>
          <div style={{ ...row, justifyContent: 'space-between' }}><strong>{metricNames[evidence.metric]}</strong><span className="mono">{metricValue(evidence)}</span></div>
          <p style={muted}>{evidence.reason}</p>
          {evidence.matchIds.length ? <Disclosure title={`Matches counted (${evidence.matchIds.length})`}>
            {evidence.matchIds.map((id) => {
              const fixture = fixtures.get(id);
              return fixture ? <div key={id} style={{ ...stack, gap: 'var(--space-1)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-2)' }}>
                <strong>{fixture.title}</strong><MatchRecord fixture={fixture} matchRef={matchRef} />
              </div> : null;
            })}
          </Disclosure> : null}
        </div>
      ))}
    </Disclosure>
  </li>;
}

function TieDialog({ pool, tied, labelOf, busy, error, conflict, onSave, onClose }: {
  pool: TieResolution['pool']; tied: Standing[]; labelOf: (id: string) => string; busy: boolean;
  error: string | null; conflict: CorrectionConflict | null;
  onSave: (tie: TieResolution, resolution?: QualifierResolution) => Promise<boolean>; onClose: () => void;
}) {
  const [order, setOrder] = useState<string[]>(() => tied.map(() => ''));
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<QualifierResolution>();
  const valid = order.every(Boolean) && new Set(order).size === order.length && !!reason.trim();
  return <TournamentDialog title="Record tie playoff" busy={busy} onClose={onClose}>
    <p style={muted}>Play the tiebreak published for this division. Enter the finishing order and the tiebreak result.</p>
    {order.map((entryId, index) => <Field key={index} label={`Tiebreak place ${index + 1}`}>
      <select style={control} value={entryId} disabled={busy} onChange={(e) => setOrder(order.map((id, i) => i === index ? e.target.value : id))}>
        <option value="">Choose an entry</option>
        {tied.filter((standing) => standing.entryId === entryId || !order.includes(standing.entryId))
          .map((standing) => <option key={standing.entryId} value={standing.entryId}>{labelOf(standing.entryId)}</option>)}
      </select>
    </Field>)}
    <Field label="Tiebreak result"><input style={control} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} /></Field>
    {error && !conflict ? <p role="alert" style={muted}>{error}</p> : null}
    {conflict ? <ResolveAffectedMatch conflict={conflict} resolution={resolution} onChange={setResolution} /> : null}
    <Button size="lg" disabled={busy || !valid || (!!conflict && !resolution?.reason.trim())} onClick={async () => {
      if (await onSave({ pool, orderedIds: order, reason: reason.trim() }, resolution)) onClose();
    }}>Save tiebreak</Button>
  </TournamentDialog>;
}

export function TournamentStandings({ division, standings, qualifyingComplete, divisions, fixtures, busy, error, conflict, labelOf, matchRef, onDivision, onAction, onOpenDialog }: {
  division: TournamentDivision; standings: DivisionStandings; qualifyingComplete: boolean; divisions: typeof divisionOptions; fixtures: Map<string, FixtureView>;
  busy: boolean; error: string | null; conflict: CorrectionConflict | null; labelOf: (id: string) => string;
  matchRef: (id: string) => string; onDivision: (id: DivisionId) => void;
  onAction: (action: TournamentAction) => Promise<boolean>; onOpenDialog: () => void;
}) {
  const [tiebreak, setTiebreak] = useState<{ pool: TieResolution['pool']; rows: Standing[] } | null>(null);
  const ranked = standings.groups.some((group) => group.rows.length > 0);
  const champions = standings.championId ? [standings.championId] : standings.jointChampionIds;
  return <div style={stack}>
    <Choices label="Standings division" value={division.id} options={divisions} onChange={onDivision} />
    <Panel title={`${divisionNames[division.id]} standings`} aside={<StatusBadge label={standings.provisional ? 'Provisional' : 'Final'} />}>
      <p style={muted}>{tieRuleText(division.rules)}</p>
      {champions.length ? <p style={{ margin: 0, overflowWrap: 'anywhere' }}><strong>{champions.length > 1 ? 'Joint champions' : 'Champion'}</strong> {champions.map(labelOf).join(', ')}</p> : null}
      {standings.provisional && division.rules.competition.type === 'pools' ? <p style={muted}>The playoff final decides the champion.</p> : null}
      {!ranked ? <p style={muted}>No entries to rank yet.</p> : null}
      <div style={grid}>
        {standings.groups.filter((group) => group.rows.length).map((group) => {
          const ties = group.rows.filter((standing) => standing.joint && !standing.withdrawn);
          const tiePlaces = Array.from(new Set(ties.map((standing) => standing.place)));
          const canResolve = group.pool ? group.rows.some((standing) => !standing.provisional) : qualifyingComplete;
          return <section key={group.pool ?? 'all'} aria-label={group.pool ? `Pool ${group.pool}` : 'Ranks'} style={stack}>
            {group.pool ? <h3 className="display" style={{ margin: 0, fontSize: 'var(--text-body)' }}>Pool {group.pool}</h3> : null}
            <ol style={{ ...stack, listStyle: 'none', margin: 0, padding: 0 }}>
              {group.rows.map((standing) => <RankingRow key={standing.entryId} standing={standing} label={labelOf(standing.entryId)} fixtures={fixtures} matchRef={matchRef} />)}
            </ol>
            {canResolve && division.rules.tiePolicy === 'playoff' ? tiePlaces.map((place) => (
              <Button key={place} variant="secondary" disabled={busy} onClick={() => {
                onOpenDialog();
                setTiebreak({ pool: group.pool, rows: ties.filter((standing) => standing.place === place) });
              }}>Record tiebreak for place {place}</Button>
            )) : null}
          </section>;
        })}
      </div>
    </Panel>
    {tiebreak ? <TieDialog {...tiebreak} tied={tiebreak.rows} labelOf={labelOf} busy={busy} error={error} conflict={conflict}
      onClose={() => setTiebreak(null)}
      onSave={(tie, resolution) => onAction({ type: 'resolve-tie', divisionId: division.id, tie, resolution })} /> : null}
  </div>;
}
