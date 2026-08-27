import { useEffect, useMemo, useState } from 'react';
import { useSession } from './state/useSession';
import { useRoster } from './state/useRoster';
import { useAnnouncer } from './state/useAnnouncer';
import { RosterSetup } from './screens/RosterSetup';
import { SessionBoard, fmt } from './screens/SessionBoard';
import { SessionSummary } from './screens/SessionSummary';
import { ModeMenu } from './components/ModeMenu';
import { ModeChangeModal } from './components/ModeChangeModal';
import { EndSessionModal } from './components/EndSessionModal';
import { Button } from './components/Button';
import { IconButton } from './components/IconButton';
import { StandingsModal } from './components/StandingsModal';
import { PlayerPicker } from './components/PlayerPicker';
import { LineupEditor } from './components/LineupEditor';
import { append, attendanceRecency, lastSessionAttendees, listSessions } from './db/eventStore';
import { useWakeLock } from './lib/useWakeLock';
import { useRoute } from './lib/useRoute';
import { useSpeech } from './lib/useSpeech';
import { useNarrow } from './lib/useViewport';
import { useRailCollapsed } from './lib/useRailCollapsed';
import { shareSessionFile, importSessionFile } from './lib/exportFile';
import * as cmd from './domain/commands';
import { previewLineups, upNextPreview } from './domain/templates';
import { challengersPhrase, getReadyPhrase, leaderPhrase } from './domain/announce';
import { standings } from './domain/standings';
import { isStaged, stagedCourtOf } from './domain/reducer';
import { fullLineup, slotAt } from './domain/types';
import type { RuleConfig, RuleTemplate, SessionState, SlotIndex } from './domain/types';
import type { Ratings } from './domain/templates';

/** What the proposed rule would form next, said in the board's own words. Pure, so it costs nothing to compute per render. */
function previewLine(state: SessionState, ratings: Ratings, nameOf: (id: string) => string): string | null {
  const p = upNextPreview(state, ratings);
  if (!p) return null;
  return p.kind === 'lineup'
    ? `Next game would be ${p.pairs[0].map(nameOf).join(' + ')} vs ${p.pairs[1].map(nameOf).join(' + ')}.`
    : `Next challengers would be ${p.pair.map(nameOf).join(' and ')}.`;
}

export default function App() {
  const session = useSession();
  const roster = useRoster();
  const speech = useSpeech();
  const [route, navigate] = useRoute();
  const [selected, setSelected] = useState<string[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [resuming, setResuming] = useState(true);
  const [returningIds, setReturningIds] = useState<string[]>([]);
  const [standingsOpen, setStandingsOpen] = useState(false);
  /** The tapped chip. `court` is null when the tap came from the queue section, where a swap reorders instead of substituting. */
  const [picking, setPicking] = useState<{ playerId: string; court: number | null } | null>(null);
  const [editingCourt, setEditingCourt] = useState<number | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  /** The rule the organizer is proposing. Nothing is appended until the modal confirms it. */
  const [pendingRule, setPendingRule] = useState<RuleConfig | null>(null);
  const narrow = useNarrow();
  const rail = useRailCollapsed();
  const { state, dispatch } = session;

  useEffect(() => {
    void (async () => {
      const sessions = await listSessions();
      const live = sessions.find((s) => s.endedAt === null); // listSessions returns newest first
      if (live) {
        await session.loadById(live.sessionId);
        navigate('board');
      }
      setResuming(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (route === 'setup') void lastSessionAttendees().then(setReturningIds);
  }, [route]);

  const [recency, setRecency] = useState<Record<string, number>>({});
  useEffect(() => {
    if (route === 'board') void attendanceRecency().then(setRecency);
  }, [route]);

  const returning = roster.players.filter((p) => returningIds.includes(p.id) && !selected.includes(p.id));

  useEffect(() => {
    if (route !== 'board') return;
    setClock(Date.now());
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [route]);

  useWakeLock(route === 'board');

  const misrouted = (route === 'board' || route === 'summary') && !state.started;
  useEffect(() => {
    if (!resuming && misrouted) navigate('setup', { replace: true });
  }, [resuming, misrouted, navigate]);

  const nameOf = (id: string) => roster.players.find((p) => p.id === id)?.name ?? 'Unknown';

  // the queue section: whoever is left after every court has been staged, in the shape the mode can honestly promise
  const previews = useMemo(
    () => (route === 'board' ? previewLineups(state, roster.ratings) : []),
    [route, state, roster.ratings],
  );

  useAnnouncer({
    lastBatch: session.lastBatch,
    state,
    nameOf,
    speak: speech.speak,
    // names come from the roster, so wait for it rather than calling four Unknowns to a court
    active: route === 'board' && roster.players.length > 0,
  });

  const rows = useMemo(
    () => standings(state, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, roster.players],
  );

  const start = async (config: { courts: number; template: RuleTemplate; winCap: number }) => {
    // close out any dangling live session so history never holds two in-progress logs
    const dangling = (await listSessions()).filter((s) => s.endedAt === null);
    for (const s of dangling) await append({ type: 'session-ended', sessionId: s.sessionId });
    session.reset(); // a start must never append into a previous session's in-memory log
    await dispatch(cmd.startSession(config, selected, roster.ratings));
    navigate('board');
  };

  const toggleBoardCheck = (playerId: string) => {
    // On the board a tap checks a player in, or removes a waiting or staged one. Players mid game are untouchable.
    if (state.queue.includes(playerId) || isStaged(state, playerId)) void dispatch(cmd.departPlayer(state, playerId));
    else void dispatch(cmd.checkInPlayer(state, playerId, roster.ratings));
  };

  /** Where the picker's swap sends the pair: onto a court, or up and down the queue. */
  const swapPicked = (inId: string) => {
    if (!picking) return;
    void dispatch(picking.court === null
      ? cmd.swapQueue(state, picking.playerId, inId)
      : cmd.substitutePlayer(state, picking.court, picking.playerId, inId));
    setPicking(null);
  };

  const pickerContext = (playerId: string): string => {
    const court = stagedCourtOf(state, playerId) ?? Object.values(state.games).find((g) => [...g.pairs[0], ...g.pairs[1]].includes(playerId))?.court;
    if (court !== undefined && court !== null) return `Court ${court}`;
    const at = state.queue.indexOf(playerId);
    return at < 0 ? 'Not in this session' : `Waiting, position ${at + 1}`;
  };

  /** Everyone who could take the tapped player's spot: waiting, not sitting out, not already there. */
  // only a live court can go short handed, so Off the court is offered there and nowhere else
  const liftSlot: SlotIndex | null = picking && picking.court !== null
    ? (([0, 1, 2, 3] as SlotIndex[]).find(
        (i) => state.games[picking.court!] && slotAt(state.games[picking.court!].pairs, i) === picking.playerId,
      ) ?? null)
    : null;

  const candidates = picking
    ? roster.players.filter((p) => state.queue.includes(p.id) && !state.sittingOut.includes(p.id) && p.id !== picking.playerId)
    : [];

  const addAndCheckIn = async (name: string) => {
    const player = await roster.addPlayer(name);
    if (player) await dispatch(cmd.checkInPlayer(state, player.id, roster.ratings));
  };

  const createAndSeat = async (court: number, slot: SlotIndex, name: string) => {
    const player = await roster.addPlayer(name);
    // addPlayer refuses a duplicate name, so a collision leaves the seat open rather than seating the wrong person
    if (player) await dispatch(cmd.seatPlayer(state, court, slot, player.id, roster.ratings));
  };

  const end = async () => {
    speech.cancel(); // a queued court call must not talk over the podium
    setEndOpen(false);
    await dispatch(cmd.endSession(state));
    navigate('summary');
  };

  const reopen = async (sessionId: string) => {
    await session.loadById(sessionId);
    await session.undo(); // the newest effective event of an ended log is session-ended
    navigate('board');
  };

  const view = async (sessionId: string) => {
    await session.loadById(sessionId);
    navigate('summary');
  };

  const fresh = () => {
    speech.cancel();
    session.reset();
    setSelected([]);
    navigate('setup');
  };

  const muteToggle = speech.supported ? (
    <IconButton
      icon={speech.enabled ? 'volume-2' : 'volume-x'}
      ariaLabel={speech.enabled ? 'Mute announcements' : 'Unmute announcements'}
      pressed={!speech.enabled}
      onClick={speech.toggle} />
  ) : null;

  const header = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
      <span className="display" style={{ fontSize: '22px', fontWeight: 600 }}>upnext</span>
      {route === 'board' ? (
        <>
          <ModeMenu rule={state.rule} onRequestChange={(template, winCap) => setPendingRule({ template, winCap })} />
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: '20px' }}>
            {fmt((clock - state.startedAt) / 1000)}
          </span>
          {/* mid session the organizer is looking at courts, so the rail is the 360px worth giving up */}
          <IconButton
            icon={rail.collapsed ? 'panel-right-open' : 'panel-right-close'}
            ariaLabel={rail.collapsed ? 'Show check-in' : 'Hide check-in'}
            pressed={rail.collapsed}
            onClick={rail.toggle} />
          <IconButton icon="trophy" ariaLabel="Live standings" onClick={() => setStandingsOpen(true)} />
          {muteToggle}
          <Button variant="danger" onClick={() => setEndOpen(true)}>End session</Button>
        </>
      ) : route === 'summary' ? (
        <>
          <span className="micro-label">Session summary</span>
          <span style={{ flex: 1 }} />
          {muteToggle}
        </>
      ) : (
        <>
          <span className="micro-label">Open play</span>
          <span className="mono" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span style={{ flex: 1 }} />
          {muteToggle}
        </>
      )}
    </div>
  );

  if (resuming || misrouted) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  return (
    /* the wide board pins to the viewport so the courts area and the rail scroll independently; narrow stacks and keeps page scroll */
    <div style={route === 'board' && !narrow
      ? { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }
      : { minHeight: '100vh', background: 'var(--bg)' }}>
      {header}
      {route === 'setup' ? (
        <RosterSetup
          players={roster.players}
          onAddPlayer={(name) => void roster.addPlayer(name)}
          selected={selected}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onStart={(config) => void start(config)}
          onResume={(sessionId) => void session.loadById(sessionId).then(() => navigate('board'))}
          onReopen={(sessionId) => void reopen(sessionId)}
          onView={(sessionId) => void view(sessionId)}
          onImport={(file) => void importSessionFile(file).then(() => window.location.reload()).catch(() => window.alert('Import failed: that is not a valid upnext session file'))}
          onSelectAll={() => setSelected(roster.players.map((p) => p.id))}
          onClearAll={() => setSelected([])}
          returning={returning}
          onCheckInReturning={() => setSelected((s) => [...s, ...returning.map((p) => p.id)])}
          onUpdatePlayer={(id, changes) => void roster.updatePlayer(id, changes)}
          narrow={narrow}
        />
      ) : route === 'board' ? (
        <SessionBoard
          state={state}
          players={roster.players}
          undoLabel={session.undoLabel}
          onUndo={() => void session.undo()}
          canRedo={session.canRedo}
          onRedo={() => void session.redo()}
          onWin={(court, w, score) => void dispatch(cmd.finishGame(state, court, w, roster.ratings, score))}
          onCloseCourt={(court) => void dispatch(cmd.closeCourt(state, court, roster.ratings))}
          onReopenCourt={(court) => void dispatch(cmd.reopenCourt(state, court, roster.ratings))}
          onToggleSit={(id) => void dispatch(state.sittingOut.includes(id) ? cmd.returnPlayer(state, id, roster.ratings) : cmd.sitOutPlayer(state, id))}
          onToggleCheck={toggleBoardCheck}
          onAddCourt={() => void dispatch(cmd.addCourt(state, roster.ratings))}
          onAddPlayer={(n) => void addAndCheckIn(n)}
          onRemovePlayer={(id) => void dispatch(cmd.departPlayer(state, id))}
          onCourtPlayerTap={(court, id) => setPicking({ playerId: id, court })}
          onQueuePlayerTap={(id) => setPicking({ playerId: id, court: null })}
          onStart={(court) => void dispatch(cmd.startStagedGame(state, court))}
          onStage={(court) => void dispatch(cmd.stageCourt(state, court, roster.ratings))}
          onShuffle={(court) => void dispatch(cmd.shufflePairing(state, court))}
          onCallCourt={(court) => {
            const lineup = state.staged[court] ?? state.games[court]?.pairs;
            const pairs = lineup && fullLineup(lineup);
            if (pairs) speech.speak(getReadyPhrase(pairs, nameOf, court));
          }}
          onCallUpNext={() => {
            const next = previews[0];
            if (next) speech.speak(next.kind === 'lineup' ? getReadyPhrase(next.pairs, nameOf) : challengersPhrase(next.pair, nameOf));
          }}
          onEditLineup={setEditingCourt}
          previews={previews}
          narrow={narrow}
          railCollapsed={rail.collapsed}
          recency={recency}
          onSeatPlayer={(court, slot, id) => void dispatch(cmd.seatPlayer(state, court, slot, id, roster.ratings))}
          onCreateAndSeat={(court, slot, name) => void createAndSeat(court, slot, name)}
          onFillCourt={(court) => void dispatch(cmd.fillCourt(state, court, roster.ratings))}
        />
      ) : (
        <SessionSummary
          state={state}
          players={roster.players}
          onExport={() => state.sessionId && void shareSessionFile(state.sessionId)}
          onDone={fresh}
          speak={speech.speak}
          canSpeak={speech.supported && speech.enabled}
          autoRead={session.lastBatch.some((e) => e.type === 'session-ended')}
          narrow={narrow}
        />
      )}
      {picking ? (
        <PlayerPicker
          name={nameOf(picking.playerId)}
          context={pickerContext(picking.playerId)}
          candidates={candidates}
          sitting={state.sittingOut.includes(picking.playerId)}
          onSwap={swapPicked}
          onSit={() => {
            void dispatch(state.sittingOut.includes(picking.playerId)
              ? cmd.returnPlayer(state, picking.playerId, roster.ratings)
              : cmd.sitOutPlayer(state, picking.playerId));
            setPicking(null);
          }}
          onRemove={() => { void dispatch(cmd.departPlayer(state, picking.playerId)); setPicking(null); }}
          onLift={liftSlot === null ? undefined : () => {
            void dispatch(cmd.removeFromLineup(state, picking.court!, liftSlot));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
      {pendingRule && !state.ended ? (
        <ModeChangeModal
          from={state.rule}
          draft={pendingRule}
          onDraftChange={setPendingRule}
          previewLine={previewLine({ ...state, rule: pendingRule }, roster.ratings, nameOf)}
          onCancel={() => setPendingRule(null)}
          onConfirm={() => {
            void dispatch(cmd.changeRule(state, pendingRule.template, pendingRule.winCap, roster.ratings));
            setPendingRule(null);
          }}
        />
      ) : null}
      {endOpen && route === 'board' && !state.ended ? (
        <EndSessionModal
          liveCourts={Object.keys(state.games).map(Number).sort((a, b) => a - b)}
          gamesPlayed={state.finishedGames.length}
          elapsed={fmt((clock - state.startedAt) / 1000)}
          onCancel={() => setEndOpen(false)}
          onConfirm={() => void end()}
        />
      ) : null}
      {standingsOpen ? (
        <StandingsModal
          rows={rows}
          nameOf={nameOf}
          onClose={() => setStandingsOpen(false)}
          onRead={() => speech.speak(leaderPhrase(rows, nameOf))}
          canRead={speech.supported && speech.enabled}
        />
      ) : null}
      {editingCourt !== null && (state.staged[editingCourt] ?? state.games[editingCourt]) ? (
        <LineupEditor
          court={editingCourt}
          pairs={state.staged[editingCourt] ?? state.games[editingCourt].pairs}
          bench={state.queue.filter((id) => !state.sittingOut.includes(id))}
          nameOf={nameOf}
          onApply={(pairs) => void dispatch(cmd.setLineup(state, editingCourt, pairs))}
          onClose={() => setEditingCourt(null)}
        />
      ) : null}
    </div>
  );
}
