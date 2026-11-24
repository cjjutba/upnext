import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DivisionId, TournamentAction, TournamentCourt, TournamentMatch } from '../../domain/tournament';
import { Button } from '../../components/Button';
import { CourtDiagram } from '../../components/CourtDiagram';
import { StatusBadge } from '../../components/StatusBadge';
import { control, Disclosure, Field, grid, muted, Panel, row, stack } from '../../components/tournament/controls';
import { divisionNames, divisionOptions, fixtureLabel, resultText, sourceLabel } from './presentation';

type Save = (action: TournamentAction) => Promise<boolean>;

export interface FixtureView {
  match: TournamentMatch;
  title: string;
  sides: [string, string];
  winner: 0 | 1 | null;
}

export function MatchRecord({ fixture, matchRef }: {
  fixture: FixtureView; matchRef: (id: string) => string;
}) {
  const { match, sides, winner } = fixture;
  const source = match.sources;
  return <div style={{ ...stack, gap: 'var(--space-1)', overflowWrap: 'anywhere' }}>
    {match.playerIds ? <p style={{ margin: 0 }}><strong>{sides[0]}</strong> vs <strong>{sides[1]}</strong></p> : (
      <p style={muted}>{source ? `${sourceLabel(source[0], matchRef)} vs ${sourceLabel(source[1], matchRef)}. Qualification pending.` : 'Pairing pending.'}</p>
    )}
    {match.result ? <p style={muted}>
      {winner !== null ? `${sides[winner]} won. ` : ''}
      <span className={match.result.type === 'played' ? 'mono' : undefined}>{resultText(match.result)}</span>
    </p> : null}
    {match.qualifierLocked ? <p style={muted}>Started pairing retained after a correction.</p> : null}
  </div>;
}

function CourtTile({ court, fixture, busy, nameOf, matchRef, onAction, onEdit }: {
  court: TournamentCourt; fixture: FixtureView | undefined; busy: boolean; nameOf: (id: string) => string;
  matchRef: (id: string) => string; onAction: Save; onEdit: (fixture: FixtureView) => void;
}) {
  const start = fixture?.match.startedAt;
  const live = start !== null && start !== undefined;
  const status = fixture ? (live ? 'Live' : 'Staged') : 'Open';
  return <Panel title={court.name} aside={<StatusBadge status={live ? 'live' : 'neutral'} label={status} />}>
    {(court.availableFrom || court.availableUntil) ? <p style={muted}>
      Available {court.availableFrom ? new Date(court.availableFrom).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'at opening'}
      {' to '}{court.availableUntil ? new Date(court.availableUntil).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'close'}.
    </p> : null}
    {fixture ? <>
      <p style={muted}>{fixture.title}</p>
      {fixture.match.playerIds ? <CourtDiagram pairs={fixture.match.playerIds} nameOf={nameOf} /> : null}
      <MatchRecord fixture={fixture} matchRef={matchRef} />
      {live ? (
        <Button size="lg" disabled={busy} ariaLabel={`Record score on ${court.name}`} onClick={() => onEdit(fixture)}>Record score</Button>
      ) : (
        <div style={row}>
          <Button size="lg" disabled={busy} ariaLabel={`Start match on ${court.name}`} onClick={() => void onAction({
            type: 'start-match', divisionId: fixture.match.divisionId, matchId: fixture.match.id,
          })}>Start match</Button>
          <Button variant="secondary" disabled={busy} ariaLabel={`Unassign match from ${court.name}`} onClick={() => void onAction({
            type: 'assign-court', divisionId: fixture.match.divisionId, matchId: fixture.match.id, courtId: null,
          })}>Unassign</Button>
        </div>
      )}
    </> : <p style={muted}>Assign a waiting match below.</p>}
  </Panel>;
}

function FixtureCard({ fixture, courts, availableCourtIds, busy, matchRef, onAction, onEdit }: {
  fixture: FixtureView; courts: TournamentCourt[]; availableCourtIds: string[]; busy: boolean;
  matchRef: (id: string) => string; onAction: Save; onEdit: (fixture: FixtureView, forfeit?: boolean) => void;
}) {
  const { match } = fixture;
  const [courtId, setCourtId] = useState('');
  const canAssign = availableCourtIds.includes(courtId);
  const courtName = courts.find((court) => court.id === match.courtId)?.name;
  const status = match.result
    ? match.result.type === 'played' ? 'Finished' : match.result.type === 'forfeit' ? 'Forfeit' : 'Cancelled'
    : !match.playerIds ? 'Qualification pending' : match.courtId ? (match.startedAt !== null ? 'Live' : 'Staged') : 'Unassigned';
  const label = fixture.title;
  return <Panel title={label} aside={<StatusBadge label={status} />}>
    {courtName ? <p style={muted}>{courtName}</p> : null}
    <MatchRecord fixture={fixture} matchRef={matchRef} />
    {match.result ? (
      <Button variant="secondary" disabled={busy || !match.playerIds || !match.resultEventId} ariaLabel={`Edit result, ${label}, ${fixture.sides.join(' vs ')}`}
        onClick={() => onEdit(fixture)}>Edit result</Button>
    ) : null}
    {!match.result && !match.courtId && match.playerIds ? <>
      <Field label="Assign to court"><select style={control} value={canAssign ? courtId : ''} disabled={busy || availableCourtIds.length === 0}
        onChange={(e) => setCourtId(e.target.value)}>
        <option value="">{availableCourtIds.length ? 'Choose a court' : 'All courts are occupied'}</option>
        {courts.filter((court) => availableCourtIds.includes(court.id)).map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
      </select></Field>
      <div style={row}>
        <Button size="lg" disabled={busy || !canAssign} ariaLabel={`Assign match, ${label}, ${fixture.sides.join(' vs ')}`} onClick={() => void onAction({
          type: 'assign-court', divisionId: match.divisionId, matchId: match.id, courtId,
        })}>Assign match</Button>
        <Button variant="secondary" disabled={busy} ariaLabel={`Record forfeit, ${label}, ${fixture.sides.join(' vs ')}`}
          onClick={() => onEdit(fixture, true)}>Record forfeit</Button>
      </div>
    </> : null}
  </Panel>;
}

export function TournamentPlay({ courts, fixtures, busy, nameOf, matchRef, onAction, onEdit, draw }: {
  courts: TournamentCourt[]; fixtures: FixtureView[]; busy: boolean; nameOf: (id: string) => string;
  matchRef: (id: string) => string; onAction: Save; onEdit: (fixture: FixtureView, forfeit?: boolean) => void;
  draw?: ReactNode;
}) {
  const [division, setDivision] = useState<DivisionId | 'all'>('all');
  const [filter, setFilter] = useState<'waiting' | 'all' | 'finished'>('waiting');
  const occupied = new Map(fixtures.filter(({ match }) => !match.result && match.courtId).map((fixture) => [fixture.match.courtId, fixture]));
  const available = courts.filter((court) => !occupied.has(court.id)).map((court) => court.id);
  const matches = fixtures.filter(({ match }) => division === 'all' || match.divisionId === division);
  const waiting = matches.filter(({ match }) => !match.result && !match.courtId);
  const finished = matches.filter(({ match }) => match.result);
  const visible = filter === 'waiting' ? waiting : filter === 'finished' ? finished : matches;

  return <div style={stack}>
    <h2 className="display" style={{ margin: 0, fontSize: 'var(--text-h2)' }}>Court board</h2>
    <div style={grid}>{courts.map((court) => <CourtTile key={court.id} court={court} fixture={occupied.get(court.id)} busy={busy}
      nameOf={nameOf} matchRef={matchRef} onAction={onAction} onEdit={onEdit} />)}</div>
    {draw ? <Disclosure title="Draw the next Unidos match">{draw}</Disclosure> : null}
    <Panel title="Fixtures" aside={<span className="mono">{waiting.length} unassigned</span>}>
      <div style={grid}>
        <Field label="Division filter"><select value={division} style={control} onChange={(e) => setDivision(e.target.value as typeof division)}>
          <option value="all">All divisions</option>
          {divisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></Field>
        <Field label="Fixture filter"><select value={filter} style={control} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="waiting">Unassigned</option><option value="all">All fixtures</option><option value="finished">Finished</option>
        </select></Field>
      </div>
      <p style={muted}><span className="mono">{matches.length - finished.length}</span> fixtures remaining, including matches waiting for qualification.</p>
      {visible.length === 0 ? <p style={muted}>No fixtures in this view. Lock a division or confirm an Unidos draw to add fixtures.</p> : (
        <div style={grid}>{visible.map((fixture) => <FixtureCard key={fixture.match.id} fixture={fixture} courts={courts} availableCourtIds={available}
          busy={busy} matchRef={matchRef} onAction={onAction} onEdit={onEdit} />)}</div>
      )}
    </Panel>
  </div>;
}

export function fixtureTitle(match: TournamentMatch): string {
  return `${divisionNames[match.divisionId]}, ${fixtureLabel(match)}`;
}
