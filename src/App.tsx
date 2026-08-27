import { useEffect, useMemo, useState } from 'react';
import { useSession } from './state/useSession';
import { useRoster } from './state/useRoster';
import { useAnnouncer } from './state/useAnnouncer';
import { RosterSetup } from './screens/RosterSetup';
import { SessionBoard, fmt } from './screens/SessionBoard';
import { SessionSummary } from './screens/SessionSummary';
import { ModeMenu } from './components/ModeMenu';
import { Button } from './components/Button';
import { IconButton } from './components/IconButton';
import { StandingsModal } from './components/StandingsModal';
import { append, lastSessionAttendees, listSessions } from './db/eventStore';
import { useWakeLock } from './lib/useWakeLock';
import { useRoute } from './lib/useRoute';
import { useSpeech } from './lib/useSpeech';
import { shareSessionFile, importSessionFile } from './lib/exportFile';
import * as cmd from './domain/commands';
import { nextLineup } from './domain/templates';
import { leaderPhrase, upNextPhrase } from './domain/announce';
import { standings } from './domain/standings';
import { isWinnersTemplate } from './domain/types';
import type { Pairs, RuleTemplate, SlotIndex } from './domain/types';

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

  // null in the winners templates, where the next lineup depends on who wins
  const nextUp: Pairs | null =
    route === 'board' && !isWinnersTemplate(state.rule.template) ? nextLineup(state, null, roster.ratings) : null;

  useAnnouncer({
    lastBatch: session.lastBatch,
    state,
    nextUp,
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
    // On the board a tap checks a player in, or departs a waiting player. Playing players are untouchable.
    if (state.queue.includes(playerId)) void dispatch(cmd.departPlayer(state, playerId));
    else void dispatch(cmd.checkInPlayer(state, playerId, roster.ratings));
  };

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
    await dispatch(cmd.endSession(state));
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
      <span className="display" style={{ fontSize: '22px', fontWeight: 600 }}>upnext</span>
      {route === 'board' ? (
        <>
          <ModeMenu rule={state.rule} onChange={(t, cap) => void dispatch(cmd.changeRule(state, t, cap, roster.ratings))} />
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: '20px' }}>
            {fmt((clock - state.startedAt) / 1000)}
          </span>
          <IconButton icon="trophy" ariaLabel="Live standings" onClick={() => setStandingsOpen(true)} />
          {muteToggle}
          <Button variant="danger" onClick={() => void end()}>End session</Button>
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
    /* the board pins to the viewport so the courts area and the rail scroll independently; other routes keep page scroll */
    <div style={route === 'board'
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
          onImport={(file) => void importSessionFile(file).then(() => window.location.reload()).catch(() => window.alert('Import failed: that is not a valid upnext session file'))}
          onSelectAll={() => setSelected(roster.players.map((p) => p.id))}
          onClearAll={() => setSelected([])}
          returning={returning}
          onCheckInReturning={() => setSelected((s) => [...s, ...returning.map((p) => p.id)])}
          onUpdatePlayer={(id, changes) => void roster.updatePlayer(id, changes)}
        />
      ) : route === 'board' ? (
        <SessionBoard
          state={state}
          players={roster.players}
          undoLabel={session.undoLabel}
          onUndo={() => void session.undo()}
          canRedo={session.canRedo}
          onRedo={() => void session.redo()}
          onWin={(court, w) => void dispatch(cmd.finishGame(state, court, w, roster.ratings))}
          onCloseCourt={(court) => void dispatch(cmd.closeCourt(state, court, roster.ratings))}
          onReopenCourt={(court) => void dispatch(cmd.reopenCourt(state, court, roster.ratings))}
          onToggleSit={(id) => void dispatch(state.sittingOut.includes(id) ? cmd.returnPlayer(state, id, roster.ratings) : cmd.sitOutPlayer(state, id))}
          onToggleCheck={toggleBoardCheck}
          onAddCourt={() => void dispatch(cmd.addCourt(state, roster.ratings))}
          onAddPlayer={(n) => void addAndCheckIn(n)}
          nextUp={nextUp}
          onCallUpNext={() => nextUp && speech.speak(upNextPhrase(nextUp, nameOf))}
          canCallUpNext={speech.supported && speech.enabled}
          onRemoveFromCourt={(court, slot) => void dispatch(cmd.removeFromLineup(state, court, slot))}
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
        />
      )}
      {standingsOpen ? (
        <StandingsModal
          rows={rows}
          nameOf={nameOf}
          onClose={() => setStandingsOpen(false)}
          onRead={() => speech.speak(leaderPhrase(rows, nameOf))}
          canRead={speech.supported && speech.enabled}
        />
      ) : null}
    </div>
  );
}
