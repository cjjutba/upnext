import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { Choices, control, Field, muted, Panel, row, TournamentDialog } from '../components/tournament/controls';
import { MatchEditor, ResolveAffectedMatch } from '../components/tournament/MatchEditor';
import type { CorrectionConflict } from '../components/tournament/MatchEditor';
import { divisionQualifyingComplete, getDivisionStandings, getMatchWinner, getRotationProgress } from '../domain/tournament';
import type {
  DivisionId, MatchResult, QualifierResolution, TournamentMatch, TournamentState,
} from '../domain/tournament';
import { useWakeLock } from '../lib/useWakeLock';
import { useRoster } from '../state/useRoster';
import { reviewTournamentCorrection, useTournament } from '../state/useTournament';
import type { CorrectionAction } from '../state/useTournament';
import { downloadTournamentBackup, TournamentBackup } from '../screens/tournament/TournamentBackup';
import { TournamentPlay, fixtureTitle } from '../screens/tournament/TournamentPlay';
import type { FixtureView } from '../screens/tournament/TournamentPlay';
import { AddRosterPlayer, DivisionSetup, EventSettings, tournamentHasPlayed, UnidosDraw } from '../screens/tournament/TournamentSetup';
import { TournamentStandings } from '../screens/tournament/TournamentStandings';
import { divisionNames, divisionOptions, formatScoreRule, withdrawRuleText } from '../screens/tournament/presentation';

const views = [
  { value: 'setup', label: 'Setup' }, { value: 'courts', label: 'Courts' },
  { value: 'standings', label: 'Standings' }, { value: 'backup', label: 'Backup' },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBackup(file: File) {
  let data: unknown;
  try {
    data = JSON.parse(await file.text()) as unknown;
  } catch {
    throw new Error('Choose a readable Upnext tournament backup file.');
  }
  if (!isRecord(data) || data.format !== 'upnext-tournament' || data.v !== 1 || !Array.isArray(data.events) || !data.events.length) {
    throw new Error('Choose a version 1 Upnext tournament backup.');
  }
  let name = '';
  let lastActivity = 0;
  for (const event of data.events as unknown[]) {
    if (!isRecord(event) || !isRecord(event.action) || typeof event.ts !== 'number') throw new Error('This backup has a damaged event.');
    if (event.action.type === 'create' || event.action.type === 'update-settings') {
      const settings = event.action.settings;
      if (!isRecord(settings) || typeof settings.name !== 'string' || !settings.name.trim()) throw new Error('The backup needs a tournament name.');
      name = settings.name;
    }
    lastActivity = event.ts;
  }
  if (!name || !Number.isFinite(lastActivity)) throw new Error('The backup is missing its tournament details.');
  const exportedAt = typeof data.exportedAt === 'number' && Number.isFinite(data.exportedAt) ? data.exportedAt : null;
  return { data, name, time: `${exportedAt === null ? 'Last recorded activity' : 'Backup saved'} ${new Date(exportedAt ?? lastActivity).toLocaleString()}.` };
}

function WithdrawDialog({ entry, rule, affected, busy, error, conflict, onSave, onClose }: {
  entry: string; rule: string; affected: number; busy: boolean; error: string | null; conflict: CorrectionConflict | null;
  onSave: (reason: string, resolution?: QualifierResolution) => Promise<boolean>; onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<QualifierResolution>();
  return <TournamentDialog title={`Withdraw ${entry}`} busy={busy} onClose={onClose}>
    <p style={muted}>{rule} {affected} current unfinished {affected === 1 ? 'fixture involves' : 'fixtures involve'} this entry.</p>
    <Field label="Withdrawal reason"><input style={control} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></Field>
    {error && !conflict ? <p role="alert" style={muted}>{error}</p> : null}
    {conflict ? <ResolveAffectedMatch conflict={conflict} resolution={resolution} onChange={setResolution} /> : null}
    <Button size="lg" disabled={busy || !reason.trim() || (!!conflict && !resolution?.reason.trim())} onClick={async () => {
      if (await onSave(reason.trim(), resolution)) onClose();
    }}>Confirm withdrawal</Button>
  </TournamentDialog>;
}

type TournamentController = ReturnType<typeof useTournament>;
type Roster = ReturnType<typeof useRoster>;

function BackupPanel({ tournament, refresh }: {
  tournament: TournamentController; refresh: Roster['refresh'];
}) {
  return <TournamentBackup
    hasTournament={!!tournament.state} busy={tournament.busy} error={tournament.failure?.message ?? null}
    onRead={readBackup}
    onSave={() => tournament.backup(downloadTournamentBackup)}
    onRestore={async (data) => {
      const restored = await tournament.restore(data);
      if (restored) await refresh();
      return restored;
    }}
  />;
}

function TournamentWorkspace({ state, tournament, roster }: {
  state: TournamentState; tournament: TournamentController; roster: Roster;
}) {
  const [tab, setTab] = useState<(typeof views)[number]['value']>(() =>
    Object.values(state.divisions).some((division) => division.locked) && !state.divisions.unidos.draw ? 'courts' : 'setup',
  );
  const [setupDivision, setSetupDivision] = useState<DivisionId>('unidos');
  const [rankDivision, setRankDivision] = useState<DivisionId>('unidos');
  const [editing, setEditing] = useState<{ fixture: FixtureView; forfeit?: boolean } | null>(null);
  const [withdrawal, setWithdrawal] = useState<{ divisionId: DivisionId; entryId: string; label: string } | null>(null);
  const { busy, failure, save, clearFailure } = tournament;
  useWakeLock(tab === 'courts');

  const names = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of roster.players) {
      const key = player.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Map(roster.players.map((player) => [
      player.id, (counts.get(player.name.toLowerCase()) ?? 0) > 1 ? `${player.name} (${player.id.slice(-6)})` : player.name,
    ]));
  }, [roster.players]);
  const nameOf = (id: string) => names.get(id) ?? 'Unknown player';
  const standing = useMemo(() => tab === 'standings' ? getDivisionStandings(state, rankDivision) : null, [state, rankDivision, tab]);
  const rotation = useMemo(() => state.divisions.unidos.rules.mode === 'rotating' ? getRotationProgress(state) : undefined, [state]);
  const labelOf = (id: string, divisionId: DivisionId) => {
    const team = state.divisions[divisionId].teams.find((entry) => entry.id === id);
    if (!team) return nameOf(id);
    const players = team.playerIds.map(nameOf).join(' and ');
    return team.name === players ? team.name : `${team.name} (${players})`;
  };
  const matchSides = (match: TournamentMatch): [string, string] => {
    if (match.teamIds) return [labelOf(match.teamIds[0], match.divisionId), labelOf(match.teamIds[1], match.divisionId)];
    if (match.playerIds) return [match.playerIds[0].map(nameOf).join(' and '), match.playerIds[1].map(nameOf).join(' and ')];
    return ['Qualification pending', 'Qualification pending'];
  };

  const fixtures: FixtureView[] = Object.values(state.divisions).flatMap((division) => {
    const counts = new Map<string, number>();
    for (const match of division.matches) {
      const title = fixtureTitle(match);
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    const playoffFinal = division.matches.filter((match) => match.phase === 'playoff').at(-1)?.id;
    const titles = new Map<string, number>();
    return division.matches.map((match) => {
      const title = fixtureTitle(match);
      const counter = (titles.get(title) ?? 0) + 1;
      titles.set(title, counter);
      const repeated = (counts.get(title) ?? 0) > 1;
      return {
        match,
        title: match.id === playoffFinal ? `${divisionNames[division.id]}, playoff final` : repeated ? `${title}, match ${counter}` : title,
        sides: matchSides(match), winner: getMatchWinner(match, division.rules.score),
      };
    });
  });
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.match.id, fixture]));
  const matchRef = (id: string) => fixtureById.get(id)?.title ?? 'an earlier playoff match';
  const where = (id: string) => {
    const fixture = fixtureById.get(id);
    if (!fixture) return matchRef(id);
    const court = state.settings.courts.find((item) => item.id === fixture.match.courtId);
    return `${fixture.title}${court ? ` on ${court.name}` : ''}. ${fixture.sides.join(' vs ')}`;
  };
  const conflict = failure?.code === 'qualifier-conflict' ? { message: failure.message, affectedMatches: failure.matchIds.map(where) } : null;
  const error = failure ? [failure.message, ...(failure.code === 'court-conflict' ? failure.matchIds.map(where) : [])].join(' ') : null;

  const selectView = (view: typeof tab) => {
    clearFailure();
    setTab(view);
  };

  const startEdit = (fixture: FixtureView, forfeit?: boolean) => {
    clearFailure();
    setEditing({ fixture, forfeit });
  };
  const editAction = (match: TournamentMatch, result: MatchResult, reason: string, resolution?: QualifierResolution): CorrectionAction | null =>
    match.resultEventId ? {
      type: 'correct-result', divisionId: match.divisionId, matchId: match.id,
      expectedResultId: match.resultEventId, result, reason, resolution,
    } : null;
  const saveResult = (match: TournamentMatch, result: MatchResult, reason: string, resolution?: QualifierResolution) =>
    save(editAction(match, result, reason, resolution) ?? { type: 'record-result', divisionId: match.divisionId, matchId: match.id, result });
  const preview = (action: CorrectionAction) => {
    const reviewed = reviewTournamentCorrection(state, action);
    return {
      error: reviewed.error,
      affectedMatches: reviewed.affectedIds.map(where),
      changes: reviewed.changes.map(({ before, after }) => ({
        label: matchRef(before.id),
        before: before.playerIds ? matchSides(before).join(' vs ') : 'Qualification pending',
        after: after.playerIds ? matchSides(after).join(' vs ') : 'Qualification pending',
      })),
    };
  };

  const draw = <UnidosDraw division={state.divisions.unidos} busy={busy} rotation={rotation} nameOf={nameOf} onAction={save} />;
  const division = state.divisions[setupDivision];
  const standingDivision = state.divisions[rankDivision];
  const withdrawingDivision = withdrawal && state.divisions[withdrawal.divisionId];
  const impacted = withdrawal && withdrawingDivision ? withdrawingDivision.matches.filter((match) =>
    !match.result && (match.teamIds?.includes(withdrawal.entryId) || match.playerIds?.flat().includes(withdrawal.entryId)),
  ).length : 0;

  const lockedCount = Object.values(state.divisions).filter((item) => item.locked).length;
  const liveCount = fixtures.filter(({ match }) => match.startedAt !== null && !match.result).length;

  return <div className="tournament-workspace">
    <header className="tournament-masthead">
      <div>
        <h1 className="display">{state.settings.name}</h1>
        <p>{state.settings.date ? <time dateTime={state.settings.date}>{new Date(state.settings.date + 'T12:00:00').toLocaleDateString(undefined, {
          weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
        })}</time> : 'Set the event date in Setup.'}</p>
      </div>
      <dl className="tournament-tally">
        <div><dt>Courts</dt><dd className="mono">{state.settings.courts.length}</dd></div>
        <div><dt>Divisions locked</dt><dd className="mono">{lockedCount} of 4</dd></div>
        <div><dt>Live matches</dt><dd className="mono">{liveCount}</dd></div>
      </dl>
    </header>
    <Choices label="Tournament views" value={tab} options={views} onChange={selectView} navigation />
    {error ? <p role="alert" className="app-notice" data-kind="error">{error}</p> : null}
    {tab === 'setup' ? <>
      <div className="tournament-setup-grid">
        <EventSettings key={JSON.stringify(state.settings)} settings={state.settings} locked={tournamentHasPlayed(state)} busy={busy}
          onSave={(settings) => void save({ type: 'update-settings', settings })} />
        <AddRosterPlayer roster={roster.players} busy={busy} onAdd={async (name) => {
          clearFailure();
          try {
            if (await roster.addPlayer(name)) return true;
            throw new Error('A player with that name is already on the roster.');
          } catch (error) {
            tournament.report(error);
            return false;
          }
        }} />
      </div>
      <h2 className="display division-section-title">Divisions</h2>
      <Choices label="Setup division" value={setupDivision} options={divisionOptions} onChange={(id) => {
        clearFailure();
        setSetupDivision(id);
      }} />
      <DivisionSetup key={division.id} division={division} roster={roster.players} nameOf={nameOf} busy={busy} error={error} onAction={save}
        onWithdraw={(entryId, label) => {
          clearFailure();
          setWithdrawal({ divisionId: division.id, entryId, label });
        }} />
      {setupDivision === 'unidos' ? draw : null}
    </> : null}
    {tab === 'courts' ? <TournamentPlay courts={state.settings.courts} fixtures={fixtures} busy={busy} nameOf={nameOf}
      matchRef={matchRef} onAction={save} onEdit={startEdit}
      draw={state.divisions.unidos.locked && state.divisions.unidos.rules.mode === 'rotating' ? draw : undefined} /> : null}
    {tab === 'standings' && standing ? <TournamentStandings key={rankDivision} division={standingDivision} standings={standing}
      qualifyingComplete={divisionQualifyingComplete(state, standingDivision)}
      divisions={divisionOptions} fixtures={fixtureById} busy={busy} error={error} conflict={conflict}
      labelOf={(id) => labelOf(id, rankDivision)} matchRef={matchRef} onDivision={(id) => {
        clearFailure();
        setRankDivision(id);
      }} onAction={save} onOpenDialog={clearFailure} /> : null}
    {tab === 'backup' ? <>
      <BackupPanel tournament={tournament} refresh={roster.refresh} />
      <Button variant="secondary" disabled={busy} onClick={() => void tournament.close()}>Tournament list</Button>
    </> : null}
    {editing ? <MatchEditor key={editing.fixture.match.id} match={editing.fixture.match} teams={editing.fixture.sides}
      format={state.divisions[editing.fixture.match.divisionId].rules.score}
      scoringRule={formatScoreRule(state.divisions[editing.fixture.match.divisionId].rules.score)}
      forfeitOnly={editing.forfeit} busy={busy} error={error} conflict={conflict}
      onClose={() => { clearFailure(); setEditing(null); }}
      onSave={(result, reason, resolution) => saveResult(editing.fixture.match, result, reason, resolution)}
      onReview={editing.fixture.match.resultEventId && (editing.fixture.match.phase === 'pool' || editing.fixture.match.phase === 'playoff')
        ? (result, reason, resolution) => preview(editAction(editing.fixture.match, result, reason, resolution)!)
        : undefined} /> : null}
    {withdrawal && withdrawingDivision ? <WithdrawDialog entry={withdrawal.label} rule={withdrawRuleText(withdrawingDivision.rules)}
      affected={impacted} busy={busy} error={error} conflict={conflict} onClose={() => { clearFailure(); setWithdrawal(null); }}
      onSave={(reason, resolution) => save({ type: 'withdraw', divisionId: withdrawal.divisionId, entryId: withdrawal.entryId, reason, resolution })} /> : null}
  </div>;
}

export function TournamentRoute() {
  const tournament = useTournament();
  const roster = useRoster();
  return <>
    <AppHeader mode="tournament" />
    <main id="app-main" className="tournament-page" tabIndex={-1}>
      {tournament.loading ? <p role="status" style={muted}>Loading tournaments.</p> : tournament.state ? (
        <TournamentWorkspace key={tournament.state.id} state={tournament.state} tournament={tournament} roster={roster} />
      ) : <>
        <header className="tournament-masthead tournament-masthead--empty">
          <div>
            <h1 className="display">Tournaments</h1>
            <p>Set up entries and draws, then run courts, scores, and standings.</p>
          </div>
        </header>
        {tournament.failure ? <p role="alert" className="app-notice" data-kind="error">{tournament.failure.message}</p> : null}
        <Panel title="On this device">
          {tournament.list.length ? tournament.list.map((entry) => (
            <div key={entry.id} style={{ ...row, justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere', paddingBlock: 'var(--space-2)' }}>
                <strong>{entry.name}</strong>
                <p style={muted}>{entry.date || 'Date pending'}</p>
              </div>
              <Button variant="secondary" disabled={tournament.busy} ariaLabel={`Open ${entry.name}`} onClick={() => void tournament.open(entry.id)}>Open</Button>
            </div>
          )) : <p style={muted}>Create a tournament for Unidos and the three Plaridel Open divisions.</p>}
          <Button size="lg" disabled={tournament.busy} onClick={() => void tournament.create()}>Create tournament</Button>
        </Panel>
        <BackupPanel tournament={tournament} refresh={roster.refresh} />
      </>}
    </main>
  </>;
}
