import { useEffect, useMemo, useState } from 'react';
import { useSession } from './state/useSession';
import { useRoster } from './state/useRoster';
import { fmt } from './screens/SessionBoard';
import { ModeMenu } from './components/ModeMenu';
import { ModeChangeModal } from './components/ModeChangeModal';
import { EndSessionModal } from './components/EndSessionModal';
import { Button } from './components/Button';
import { AppHeader } from './components/AppHeader';
import { IconButton } from './components/IconButton';
import { AnnouncementVoiceModal } from './components/AnnouncementVoiceModal';
import { StandingsModal } from './components/StandingsModal';
import { SetupRoute } from './routes/SetupRoute';
import { BoardRoute } from './routes/BoardRoute';
import { SummaryRoute } from './routes/SummaryRoute';
import { SessionRoute } from './routes/SessionRoute';
import { TournamentRoute } from './routes/TournamentRoute';
import { append, listSessions } from './db/eventStore';
import { useRoute, useMisrouteGuard } from './lib/useRoute';
import type { Navigate, Route } from './lib/useRoute';
import { useSpeech } from './lib/useSpeech';
import { useNarrow, useReducedMotion } from './lib/useViewport';
import { useRailCollapsed } from './lib/useRailCollapsed';
import * as cmd from './domain/commands';
import { upNextPreview } from './domain/templates';
import { getReadyPhrase, leaderPhrase } from './domain/announce';
import { standings } from './domain/standings';
import type { RuleConfig, RuleTemplate, SessionState } from './domain/types';
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
  const [route, navigate] = useRoute();
  return route.name === 'tournament'
    ? <TournamentRoute />
    : <OpenPlay route={route} navigate={navigate} />;
}

function OpenPlay({ route, navigate }: { route: Exclude<Route, { name: 'tournament' }>; navigate: Navigate }) {
  const session = useSession();
  const roster = useRoster();
  const speech = useSpeech();
  const [clock, setClock] = useState(() => Date.now());
  const [resuming, setResuming] = useState(true);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  /** The rule the organizer is proposing. Nothing is appended until the modal confirms it. */
  const [pendingRule, setPendingRule] = useState<RuleConfig | null>(null);
  const narrow = useNarrow();
  const rail = useRailCollapsed();
  const motion = !useReducedMotion();
  const { state, dispatch } = session;

  useEffect(() => {
    void (async () => {
      // A deep link straight to a past session resolves its own id; the live-session check would only race it.
      if (route.name !== 'session') {
        const sessions = await listSessions();
        const live = sessions.find((s) => s.endedAt === null); // listSessions returns newest first
        if (live) {
          await session.loadById(live.sessionId);
          navigate({ name: 'board' }, { replace: true });
        }
      }
      setResuming(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (route.name !== 'board') return;
    setClock(Date.now());
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [route.name]);

  // Bare /app is never a screen to linger on: once resuming finds nothing live, it resolves to setup.
  const resolveTarget = route.name === 'resolve' ? 'setup' : null;
  useMisrouteGuard(resuming, resolveTarget, navigate);

  const nameOf = (id: string) => roster.players.find((p) => p.id === id)?.name ?? 'Unknown';

  const rows = useMemo(
    () => standings(state, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, roster.players],
  );

  const start = async (config: { courts: number; template: RuleTemplate; winCap: number }, selectedIds: string[]) => {
    // close out any dangling live session so history never holds two in-progress logs
    const dangling = (await listSessions()).filter((s) => s.endedAt === null);
    for (const s of dangling) await append({ type: 'session-ended', sessionId: s.sessionId });
    session.reset(); // a start must never append into a previous session's in-memory log
    await dispatch(cmd.startSession(config, selectedIds, roster.ratings));
    navigate({ name: 'board' }, { replace: true });
  };

  const end = async () => {
    speech.cancel(); // a queued court call must not talk over the podium
    setEndOpen(false);
    await dispatch(cmd.endSession(state));
    navigate({ name: 'summary' }, { replace: true });
  };

  const resume = async (sessionId: string) => {
    await session.loadById(sessionId);
    navigate({ name: 'board' }, { replace: true });
  };

  const reopen = async (sessionId: string) => {
    await session.loadById(sessionId, { reopen: true });
    navigate({ name: 'board' }, { replace: true });
  };

  // A "look, then come back" action, so it pushes: Back naturally returns to setup.
  const view = (sessionId: string) => navigate({ name: 'session', id: sessionId });

  const fresh = () => {
    speech.cancel();
    session.reset();
    navigate({ name: 'setup' }, { replace: true });
  };

  const announcementControls = (
    <>
      <IconButton icon="megaphone" ariaLabel="Announcement voice" onClick={() => setVoiceOpen(true)} />
      {speech.supported ? (
        <IconButton
          icon={speech.enabled ? 'volume-2' : 'volume-x'}
          ariaLabel={speech.enabled ? 'Mute announcements' : 'Unmute announcements'}
          pressed={!speech.enabled}
          onClick={speech.toggle} />
      ) : null}
    </>
  );

  const header = (
    <AppHeader mode="open-play" openPlayHref={route.name === 'board' ? '/app/board' : '/app/setup'}>
      {route.name === 'board' ? (
        <>
          <div className="session-mode">
            <ModeMenu rule={state.rule} onRequestChange={(template, winCap) => setPendingRule({ template, winCap })} />
            <span className="mono session-elapsed" aria-label="Session elapsed time">{fmt((clock - state.startedAt) / 1000)}</span>
          </div>
          <div className="session-actions">
            <IconButton
              icon={rail.collapsed ? 'panel-right-open' : 'panel-right-close'}
              ariaLabel={rail.collapsed ? 'Show check-in' : 'Hide check-in'}
              pressed={rail.collapsed} onClick={rail.toggle} />
            <IconButton icon="trophy" ariaLabel="Live standings" onClick={() => setStandingsOpen(true)} />
            {announcementControls}
            <Button variant="danger" onClick={() => setEndOpen(true)}>End session</Button>
          </div>
        </>
      ) : announcementControls}
    </AppHeader>
  );

  if (resuming || resolveTarget) return <div style={{ minHeight: '100vh', background: 'var(--canvas)' }} />;

  return (
    /* the wide board pins to the viewport so the courts area and the rail scroll independently; narrow stacks and keeps page scroll */
    <div style={route.name === 'board' && !narrow
      ? { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--canvas)' }
      : { minHeight: '100vh', background: 'var(--canvas)' }}>
      {header}
      {route.name === 'setup' ? (
        <SetupRoute
          players={roster.players}
          onAddPlayer={(name) => void roster.addPlayer(name)}
          onUpdatePlayer={(id, changes) => void roster.updatePlayer(id, changes)}
          onStart={(config, selectedIds) => void start(config, selectedIds)}
          onResume={(sessionId) => void resume(sessionId)}
          onReopen={(sessionId) => void reopen(sessionId)}
          onView={view}
          narrow={narrow}
        />
      ) : route.name === 'board' ? (
        <BoardRoute
          state={state}
          players={roster.players}
          ratings={roster.ratings}
          dispatch={dispatch}
          dispatchLatest={session.dispatchLatest}
          addPlayer={roster.addPlayer}
          undoLabel={session.undoLabel}
          onUndo={() => void session.undo()}
          canRedo={session.canRedo}
          onRedo={() => void session.redo()}
          lastBatch={session.lastBatch}
          speak={speech.speak}
          resuming={resuming}
          navigate={navigate}
          narrow={narrow}
          railCollapsed={rail.collapsed}
          onExpandRail={rail.expand}
          motion={motion}
        />
      ) : route.name === 'summary' ? (
        <SummaryRoute
          state={state}
          players={roster.players}
          autoRead={session.lastBatch.some((e) => e.type === 'session-ended')}
          onDone={fresh}
          speak={speech.speak}
          canSpeak={speech.supported && speech.enabled}
          resuming={resuming}
          navigate={navigate}
        />
      ) : route.name === 'session' ? (
        <SessionRoute
          id={route.id}
          state={state}
          lastBatch={session.lastBatch}
          loadById={session.loadById}
          players={roster.players}
          onDone={fresh}
          speak={speech.speak}
          canSpeak={speech.supported && speech.enabled}
          resuming={resuming}
          navigate={navigate}
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
      {endOpen && route.name === 'board' && !state.ended ? (
        <EndSessionModal
          liveCourts={Object.keys(state.games).map(Number).sort((a, b) => a - b)}
          gamesPlayed={state.finishedGames.length}
          elapsed={fmt((clock - state.startedAt) / 1000)}
          onCancel={() => setEndOpen(false)}
          onConfirm={() => void end()}
        />
      ) : null}
      {voiceOpen ? (
        <AnnouncementVoiceModal
          voiceAvailable={speech.voiceAvailable}
          enabled={speech.enabled}
          onPreview={() => speech.speak(
            getReadyPhrase([['Mia', 'Carlo'], ['Bea', 'Nico']], (name) => name, 2),
            { key: 'voice-preview' },
          )}
          onClose={() => setVoiceOpen(false)}
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
    </div>
  );
}
