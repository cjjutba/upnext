import { useState } from 'react';
import type {
  DivisionRules, Draw, PlayerPair, RotationProgress, TournamentAction, TournamentCourt,
  TournamentDivision, TournamentSettings, TournamentState,
} from '../../domain/tournament';
import type { Player } from '../../domain/types';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { control, Disclosure, Field, grid, muted, Panel, row, stack, TournamentDialog } from '../../components/tournament/controls';
import { divisionNames, formatScoreRule, tieRuleText, withdrawRuleText } from './presentation';

type Save = (action: TournamentAction) => Promise<boolean>;

function courtTime(date: string, value: string): number | undefined {
  return date && value ? new Date(`${date}T${value}`).getTime() : undefined;
}

function localTime(stamp: number | undefined): string {
  if (stamp === undefined) return '';
  const date = new Date(stamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function EventSettings({ settings, locked, busy, onSave }: {
  settings: TournamentSettings; locked: boolean; busy: boolean; onSave: (draft: TournamentSettings) => void;
}) {
  const [name, setName] = useState(settings.name);
  const [date, setDate] = useState(settings.date);
  const [courts, setCourts] = useState(() => settings.courts.map((court) => ({
    id: court.id, name: court.name, from: localTime(court.availableFrom), until: localTime(court.availableUntil),
  })));
  const setCourt = (index: number, change: Partial<(typeof courts)[number]>) => {
    setCourts((draft) => draft.map((court, i) => i === index ? { ...court, ...change } : court));
  };
  const eventCourts: TournamentCourt[] = courts.map((court) => ({
    id: court.id, name: court.name.trim(), availableFrom: courtTime(date, court.from), availableUntil: courtTime(date, court.until),
  }));
  const invalidWindow = courts.some((court) => (court.from || court.until) && (!date || (
    court.from && court.until && court.from >= court.until
  )));
  const names = eventCourts.map((court) => court.name.toLowerCase());
  const valid = name.trim() !== '' && !invalidWindow && names.every(Boolean) && new Set(names).size === names.length;

  return <Panel title="Event details">
    <div style={grid}>
      <Field label="Tournament name"><input style={control} value={name} disabled={locked || busy} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Event date"><input type="date" style={control} value={date} disabled={locked || busy} onChange={(e) => setDate(e.target.value)} /></Field>
    </div>
    <div style={stack}>
      <p style={muted}>Set the date and any court availability windows in this device's local time. Blank times leave the court available all day.</p>
      {courts.map((court, i) => (
        <div key={court.id} style={grid}>
          <Field label={`Court ${i + 1} name`}><input style={control} value={court.name} disabled={locked || busy} onChange={(e) => setCourt(i, { name: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
            <Field label={`Court ${i + 1} opens`}><input type="time" style={control} value={court.from} disabled={locked || busy} onChange={(e) => setCourt(i, { from: e.target.value })} /></Field>
            <Field label={`Court ${i + 1} closes`}><input type="time" style={control} value={court.until} disabled={locked || busy} onChange={(e) => setCourt(i, { until: e.target.value })} /></Field>
          </div>
        </div>
      ))}
      {invalidWindow ? <p role="alert" style={muted}>Set an event date and make each closing time later than its opening time.</p> : null}
      {locked ? <p style={muted}>Event details are locked after play starts.</p> : (
        <div style={row}>
          <Button variant="secondary" disabled={busy} onClick={() => setCourts([...courts, {
            id: crypto.randomUUID(), name: `Court ${courts.length + 1}`, from: '', until: '',
          }])}>Add court</Button>
          <Button variant="secondary" disabled={busy || courts.length <= 1} onClick={() => setCourts(courts.slice(0, -1))}>Remove last court</Button>
          <Button disabled={busy || !valid} onClick={() => onSave({ name: name.trim(), date, courts: eventCourts })}>Save event details</Button>
        </div>
      )}
    </div>
  </Panel>;
}

function IntegerField({ label, value, min = 1, max, onChange }: {
  label: string; value: string; min?: number; max?: number; onChange: (value: string) => void;
}) {
  return <Field label={label}><input className="mono" type="number" inputMode="numeric" min={min} max={max}
    style={control} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

function DivisionRulesEditor({ division, busy, onSave }: {
  division: TournamentDivision; busy: boolean; onSave: (rules: DivisionRules) => Promise<boolean>;
}) {
  const { rules } = division;
  const [mode, setMode] = useState(rules.mode);
  const initialPreset = ['4', '6', '8'].includes(String(rules.gamesPerPlayer)) ? String(rules.gamesPerPlayer) : 'custom';
  const [preset, setPreset] = useState(initialPreset);
  const [custom, setCustom] = useState(String(rules.gamesPerPlayer));
  const [competition, setCompetition] = useState(rules.competition.type);
  const [poolA, setPoolA] = useState(String(rules.competition.type === 'pools' ? rules.competition.poolSizes[0] : 4));
  const [poolB, setPoolB] = useState(String(rules.competition.type === 'pools' ? rules.competition.poolSizes[1] : 4));
  const [advance, setAdvance] = useState(String(rules.competition.type === 'pools' ? rules.competition.advancePerPool : 2));
  const [points, setPoints] = useState(String(rules.score.pointsToWin));
  const [winBy, setWinBy] = useState(String(rules.score.winBy));
  const [games, setGames] = useState(String(rules.score.gamesToWin));
  const [cap, setCap] = useState(String(rules.score.pointCap ?? ''));
  const [tie, setTie] = useState(rules.tiePolicy);
  const [withdrawal, setWithdrawal] = useState(rules.withdrawalPolicy);

  const rotating = mode === 'rotating';
  const poolRules = !rotating && competition === 'pools';
  const target = rotating ? Number(preset === 'custom' ? custom : preset) : rules.gamesPerPlayer;
  const draft: DivisionRules = {
    mode, gamesPerPlayer: target, competition: poolRules
      ? { type: 'pools', poolSizes: [Number(poolA), Number(poolB)], advancePerPool: Number(advance) } : { type: 'round-robin' },
    score: { pointsToWin: Number(points), winBy: Number(winBy), gamesToWin: rotating ? 1 : Number(games), pointCap: cap === '' ? null : Number(cap) },
    tiePolicy: tie, withdrawalPolicy: withdrawal,
  };
  const valid = [points, winBy, String(draft.score.gamesToWin), String(target), ...(poolRules ? [poolA, poolB, advance] : [])].every((n) => Number.isSafeInteger(Number(n)) && Number(n) > 0)
    && target <= 1000 && draft.score.gamesToWin <= 99
    && (!poolRules || (Number(poolA) >= 2 && Number(poolB) >= 2 && Number(advance) <= Math.min(Number(poolA), Number(poolB))
      && Number.isInteger(Math.log2(Number(advance)))))
    && (cap === '' || (Number.isSafeInteger(Number(cap)) && Number(cap) >= Number(points)));
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);

  return <Disclosure title="Edit division rules">
    <fieldset disabled={busy} style={{ ...stack, margin: 0, padding: 0, border: 0 }}>
      <div style={grid}>
        {division.id === 'unidos' ? <Field label="Draw policy"><select style={control} value={mode} onChange={(e) => setMode(e.target.value as DivisionRules['mode'])}>
          <option value="rotating">Rotate partners</option><option value="blind-teams">Draw fixed partners once</option>
        </select></Field> : null}
        {rotating ? <>
          <Field label="Games per player"><select style={control} value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="custom">Custom</option>
          </select></Field>
          {preset === 'custom' ? <IntegerField label="Custom games per player" max={1000} value={custom} onChange={setCustom} /> : null}
        </> : <Field label="Competition format"><select style={control} value={competition} onChange={(e) => setCompetition(e.target.value as typeof competition)}>
          <option value="round-robin">Single round robin</option><option value="pools">Two pools and playoffs</option>
        </select></Field>}
        {poolRules ? <>
          <IntegerField label="Teams in pool A" value={poolA} min={2} onChange={setPoolA} />
          <IntegerField label="Teams in pool B" value={poolB} min={2} onChange={setPoolB} />
          <IntegerField label="Teams advancing per pool" value={advance} onChange={setAdvance} />
        </> : null}
      </div>
      <div style={grid}>
        <IntegerField label="Points to win" value={points} onChange={setPoints} />
        <IntegerField label="Win by" value={winBy} onChange={setWinBy} />
        {rotating ? <p style={muted}>Each rotating match is one scored game.</p> : <IntegerField label="Games to win a match" max={99} value={games} onChange={setGames} />}
        <Field label="Point cap, optional"><input type="number" inputMode="numeric" min={Number(points)} style={control} value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Field label="Unresolved ties"><select style={control} value={tie} onChange={(e) => setTie(e.target.value as DivisionRules['tiePolicy'])}>
          <option value="joint">Keep joint places</option><option value="playoff">Decide by playoff</option>
        </select></Field>
        <Field label="Withdrawal rule"><select style={control} value={withdrawal} onChange={(e) => setWithdrawal(e.target.value as DivisionRules['withdrawalPolicy'])}>
          <option value="forfeit">Forfeit remaining matches</option><option value="cancel">Cancel remaining matches</option>
        </select></Field>
      </div>
      <Button variant="secondary" disabled={!valid || !changed || busy} onClick={() => void onSave(draft)}>Save division rules</Button>
    </fieldset>
  </Disclosure>;
}

function RegisteredEntries({ division, roster, busy, nameOf, onAction, onWithdraw }: {
  division: TournamentDivision; roster: Player[]; busy: boolean; nameOf: (id: string) => string; onAction: Save;
  onWithdraw: (id: string, label: string) => void;
}) {
  const [player, setPlayer] = useState('');
  const [partner, setPartner] = useState('');
  const [teamName, setTeamName] = useState('');
  const individual = division.id === 'unidos';
  const hasFixedPairs = !individual || division.rules.mode === 'blind-teams' && division.locked;
  const registeredIds = new Set(individual ? division.entries.map((entry) => entry.playerId) : division.teams.flatMap((team) => team.playerIds));
  const available = roster.filter((entry) => !registeredIds.has(entry.id));
  const valid = available.some(({ id }) => id === player)
    && (individual || (player !== partner && available.some(({ id }) => id === partner)));

  const save = async () => {
    if (!valid) return;
    const action: TournamentAction = individual
      ? { type: 'set-entry', divisionId: 'unidos', playerId: player, clubMember: true }
      : { type: 'set-team', divisionId: division.id, team: {
        id: crypto.randomUUID(), name: teamName.trim() || `${nameOf(player)} and ${nameOf(partner)}`, playerIds: [player, partner],
      } };
    if (await onAction(action)) {
      setPlayer('');
      setPartner('');
      setTeamName('');
    }
  };

  const items = hasFixedPairs
    ? division.teams.map((team) => ({ id: team.id, label: team.name, detail: team.playerIds.map(nameOf).join(' and ') }))
    : division.entries.map((entry) => ({
      id: entry.playerId, label: nameOf(entry.playerId), detail: entry.clubMember ? 'Club member' : 'Ineligible',
    }));

  return <Disclosure title={hasFixedPairs ? `Teams (${items.length})` : `Entries (${items.length})`}>
    {!division.locked ? <>
      {individual ? <p style={muted}>Only register confirmed Unidos club members.</p> : null}
      <div style={grid}>
        <Field label={individual ? 'Eligible club member' : 'Player 1'}><select style={control} value={player} disabled={busy} onChange={(e) => setPlayer(e.target.value)}>
          <option value="">Choose a roster player</option>
          {available.map((entry) => <option key={entry.id} value={entry.id}>{nameOf(entry.id)}</option>)}
        </select></Field>
        {!individual ? <>
          <Field label="Player 2"><select style={control} value={partner} disabled={busy} onChange={(e) => setPartner(e.target.value)}>
            <option value="">Choose a roster player</option>
            {available.filter((entry) => entry.id !== player).map((entry) => <option key={entry.id} value={entry.id}>{nameOf(entry.id)}</option>)}
          </select></Field>
          <Field label="Team name, optional"><input style={control} value={teamName} disabled={busy} onChange={(e) => setTeamName(e.target.value)} /></Field>
        </> : null}
      </div>
      <Button variant="secondary" disabled={!valid || busy} onClick={() => void save()}>{individual ? 'Add club member' : 'Add team'}</Button>
    </> : null}
    {!individual && division.rules.competition.type === 'pools' ? <p style={muted}>
      Pool A takes the first {division.rules.competition.poolSizes[0]} registered teams. The remaining teams go in pool B.
    </p> : null}
    {items.length === 0 ? <p style={muted}>No entries yet.</p> : (
      <ul style={{ ...stack, margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item) => {
          const withdrawal = division.withdrawals.find(({ entryId }) => entryId === item.id);
          return <li key={item.id} style={{ ...row, justifyContent: 'space-between', borderTop: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0, overflowWrap: 'anywhere', paddingBlock: 'var(--space-2)' }}>
              <strong>{item.label}</strong>
              {item.detail !== item.label ? <p style={muted}>{item.detail}</p> : null}
              {withdrawal ? <p style={muted}>Withdrawn. {withdrawal.reason}</p> : null}
            </div>
            {!withdrawal ? <Button variant="ghost" disabled={busy} ariaLabel={`${division.locked ? 'Withdraw' : 'Remove'} ${item.label}`}
              onClick={() => {
                if (division.locked) onWithdraw(item.id, item.label);
                else void onAction(individual
                  ? { type: 'remove-entry', divisionId: 'unidos', playerId: item.id }
                  : { type: 'remove-team', divisionId: division.id, teamId: item.id });
              }}>{division.locked ? 'Withdraw' : 'Remove'}</Button> : null}
          </li>;
        })}
      </ul>
    )}
  </Disclosure>;
}

function DrawPairs({ draw, nameOf }: { draw: Draw; nameOf: (id: string) => string }) {
  const pairName = (pair: PlayerPair) => pair.map(nameOf).join(' and ');
  return <div style={stack}>
    <ol style={{ margin: 0, paddingInlineStart: 'var(--space-4)', overflowWrap: 'anywhere' }}>
      {draw.pairs.map((pair) => <li key={pair.join(' ')}>{pairName(pair)}</li>)}
    </ol>
    {draw.explanation.map((line) => <p key={line} style={muted}>{line}</p>)}
  </div>;
}

export function UnidosDraw({ division, rotation, busy, nameOf, onAction }: {
  division: TournamentDivision; rotation?: RotationProgress; busy: boolean; nameOf: (id: string) => string; onAction: Save;
}) {
  const [discard, setDiscard] = useState(false);
  const rotating = division.rules.mode === 'rotating';
  const eligible = division.entries.filter((entry) => entry.clubMember).length;
  const competition = division.rules.competition;
  const canDrawBlind = eligible >= 4 && eligible % 2 === 0
    && (competition.type !== 'pools' || eligible / 2 === competition.poolSizes[0] + competition.poolSizes[1]);
  return <Panel title={rotating ? 'Unidos match draw' : 'Unidos blind partner draw'} aside={<StatusBadge label={division.draw ? 'Preview' : division.locked ? 'Locked rules' : 'Setup'} />}>
    {rotation ? <>
      <p style={muted}><span className="mono">{rotation.remainingGames}</span> games still to draw toward the player target.</p>
      {rotation.explanation.map((line) => <p key={line} style={muted}>{line}</p>)}
      {rotation.unfilledSlots > 0 ? <p style={muted}><span className="mono">{rotation.unfilledSlots}</span> player game slots cannot be filled evenly.</p> : null}
      <Disclosure title="Games per player">
        <ul style={{ margin: 0, paddingInlineStart: 'var(--space-4)' }}>
          {rotation.players.map((player) => <li key={player.playerId}>{nameOf(player.playerId)} <span className="mono">{player.played}</span> played, <span className="mono">{player.scheduled}</span> scheduled, <span className="mono">{player.remaining}</span> to go</li>)}
        </ul>
      </Disclosure>
    </> : null}
    {division.draw ? <>
      <DrawPairs draw={division.draw} nameOf={nameOf} />
      <div style={row}>
        <Button size="lg" disabled={busy} onClick={() => {
          if (division.draw) void onAction({ type: 'confirm-draw', divisionId: 'unidos', drawId: division.draw.id });
        }}>Lock draw</Button>
        <Button variant="secondary" disabled={busy} onClick={() => setDiscard(true)}>Discard preview</Button>
      </div>
      {discard ? <TournamentDialog title="Discard this draw preview?" busy={busy} onClose={() => setDiscard(false)}>
        <p style={muted}>Discarding removes these preview pairs. The confirmed draws and fixtures stay on the board.</p>
        <Button size="lg" disabled={busy} onClick={async () => {
          if (division.draw && await onAction({ type: 'discard-draw', divisionId: 'unidos', drawId: division.draw.id })) setDiscard(false);
        }}>Discard draw</Button>
      </TournamentDialog> : null}
    </> : null}
    {!rotating && !division.locked && !division.draw && !canDrawBlind ? <p style={muted}>
      Register an even number of club members, at least four, with enough pairs to fill any configured pools.
    </p> : null}
    {!division.draw && (rotating || !division.locked) ? (
      <Button variant="secondary" disabled={busy || (rotating ? !division.locked || rotation?.remainingGames === 0 : !canDrawBlind)}
        onClick={() => void onAction({ type: 'preview-draw', divisionId: 'unidos' })}>
        {rotating && division.confirmedDraws.length ? 'Preview next draw' : 'Preview draw'}
      </Button>
    ) : null}
    {division.confirmedDraws.length ? (
      <Disclosure title={`Confirmed draws (${division.confirmedDraws.length})`}>
        {[...division.confirmedDraws].reverse().map((draw, i) => <div key={draw.id} style={stack}>
          <strong>Draw {division.confirmedDraws.length - i}</strong><DrawPairs draw={draw} nameOf={nameOf} />
        </div>)}
      </Disclosure>
    ) : null}
  </Panel>;
}

export function DivisionSetup({ division, roster, busy, error, nameOf, onAction, onWithdraw }: {
  division: TournamentDivision; roster: Player[]; busy: boolean; error: string | null; nameOf: (id: string) => string;
  onAction: Save; onWithdraw: (id: string, label: string) => void;
}) {
  const [review, setReview] = useState(false);
  const rules = division.rules;
  const rotating = rules.mode === 'rotating';
  const blind = rules.mode === 'blind-teams';
  const competition = rules.competition;
  const eligible = division.entries.filter((entry) => entry.clubMember).length;
  const entries = rotating || blind ? eligible : division.teams.length;
  const required = rotating ? 4 : blind ? (competition.type === 'pools' ? (competition.poolSizes[0] + competition.poolSizes[1]) * 2 : 4) : competition.type === 'pools' ? competition.poolSizes[0] + competition.poolSizes[1] : 2;
  const wrongCount = competition.type === 'pools' && entries !== required;
  const format = rotating ? `Rotate partners, ${rules.gamesPerPlayer} games per player.`
    : competition.type === 'pools'
      ? `${blind ? 'Blind partner draw. ' : ''}Two pools of ${competition.poolSizes.join(' and ')}, ${competition.advancePerPool} advancing from each.`
      : `${blind ? 'Blind partner draw. ' : ''}Single round robin.`;
  const summary = <>
    <p style={muted}>{format} {formatScoreRule(rules.score)}</p>
    <p style={muted}>{tieRuleText(rules)} {competition.type === 'pools' && rules.tiePolicy === 'joint' ? 'A joint qualifying place leaves the playoff spot pending.' : ''}</p>
    <p style={muted}>{withdrawRuleText(rules)}</p>
  </>;

  return <>
    <Panel title={divisionNames[division.id]} aside={<StatusBadge label={division.locked ? 'Locked' : 'Setup'} />}>
      {summary}
      {!division.locked && !division.draw ? <DivisionRulesEditor key={JSON.stringify(rules)} division={division} busy={busy} onSave={(draft) =>
        onAction({ type: 'configure-division', divisionId: division.id, rules: draft })} /> : null}
      <RegisteredEntries division={division} roster={roster} busy={busy || !!division.draw} nameOf={nameOf} onAction={onAction} onWithdraw={onWithdraw} />
      {!division.locked ? (
        <>
          <p style={muted}>{entries} {rotating || blind ? 'eligible players' : 'teams'} registered. {wrongCount ? `This pool format needs exactly ${required}.` : entries < required ? `At least ${required} are needed for this format.` : ''}</p>
          {!blind ? <Button size="lg" disabled={busy || entries < required || wrongCount} onClick={() => setReview(true)}>Review and lock division</Button> : null}
        </>
      ) : null}
    </Panel>
    {review ? <TournamentDialog title={`Lock ${divisionNames[division.id]}`} busy={busy} onClose={() => setReview(false)}>
      {summary}
      <p style={muted}>{entries} registered. Locking saves these rules for play.</p>
      {error ? <p role="alert" style={muted}>{error}</p> : null}
      <Button size="lg" disabled={busy} onClick={async () => {
        if (await onAction({ type: 'lock-division', divisionId: division.id })) setReview(false);
      }}>Lock division</Button>
    </TournamentDialog> : null}
  </>;
}

export function AddRosterPlayer({ roster, busy, onAdd }: {
  roster: Player[]; busy: boolean; onAdd: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  return <Panel title="Player roster" aside={<span className="mono">{roster.length}</span>}>
    <p style={muted}>Choose existing players when entering a division. Add a player here once, even if they play in several divisions.</p>
    <Field label="New player name"><input value={name} style={control} disabled={busy} onChange={(e) => setName(e.target.value)} /></Field>
    <Button variant="secondary" disabled={!name.trim() || busy} onClick={async () => {
      if (await onAdd(name.trim())) setName('');
    }}>Add roster player</Button>
  </Panel>;
}

export function tournamentHasPlayed(state: TournamentState): boolean {
  return Object.values(state.divisions).some((division) => division.matches.some((match) => match.startedAt !== null || match.result !== null));
}
