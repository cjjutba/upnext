import { useEffect, useState } from 'react';
import { useSession } from './state/useSession';
import { useRoster } from './state/useRoster';
import { RosterSetup } from './screens/RosterSetup';
import { SessionBoard, fmt } from './screens/SessionBoard';
import { SessionSummary } from './screens/SessionSummary';
import { StatusBadge } from './components/StatusBadge';
import { Button } from './components/Button';
import { append, listSessions } from './db/eventStore';
import { useWakeLock } from './lib/useWakeLock';
import { shareSessionFile, importSessionFile } from './lib/exportFile';
import * as cmd from './domain/commands';
import type { Pairs, RuleTemplate } from './domain/types';

type Screen = 'setup' | 'board' | 'summary';

const RULE_LABEL: Record<RuleTemplate, string> = {
  'all-off': 'All four off',
  'winners-stay': 'Winners stay',
  'winners-split': 'Winners split',
};

export default function App() {
  const session = useSession();
  const roster = useRoster();
  const [screen, setScreen] = useState<Screen>('setup');
  const [selected, setSelected] = useState<string[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [resuming, setResuming] = useState(true);
  const { state, dispatch } = session;

  useEffect(() => {
    void (async () => {
      const sessions = await listSessions();
      const live = sessions.find((s) => s.endedAt === null); // listSessions returns newest first
      if (live) {
        await session.loadById(live.sessionId);
        setScreen('board');
      }
      setResuming(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== 'board') return;
    setClock(Date.now());
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [screen]);

  useWakeLock(screen === 'board');

  const start = async (config: { courts: number; template: RuleTemplate; winCap: number }) => {
    // close out any dangling live session so history never holds two in-progress logs
    const dangling = (await listSessions()).filter((s) => s.endedAt === null);
    for (const s of dangling) await append({ type: 'session-ended', sessionId: s.sessionId });
    session.reset(); // a start must never append into a previous session's in-memory log
    await dispatch(cmd.startSession(config, selected));
    setScreen('board');
  };

  const toggleBoardCheck = (playerId: string) => {
    // On the board a tap checks a player in, or departs a waiting player. Playing players are untouchable.
    if (state.queue.includes(playerId)) void dispatch(cmd.departPlayer(state, playerId));
    else void dispatch(cmd.checkInPlayer(state, playerId));
  };

  const swapPartners = (court: number) => {
    const game = state.games[court];
    if (!game) return;
    const [[a, b], [c, d]] = game.pairs;
    const next: Pairs = [[a, d], [b, c]]; // cycle: ab|cd to ad|bc to ac|bd and back
    void dispatch(cmd.changeLineup(state, court, next));
  };

  const nextTemplate: Record<RuleTemplate, RuleTemplate> = {
    'all-off': 'winners-stay',
    'winners-stay': 'winners-split',
    'winners-split': 'all-off',
  };
  const cycleRule = () => void dispatch(cmd.changeRule(state, nextTemplate[state.rule.template], state.rule.winCap));

  const end = async () => {
    await dispatch(cmd.endSession(state));
    setScreen('summary');
  };

  const fresh = () => {
    session.reset();
    setSelected([]);
    setScreen('setup');
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px var(--space-4)', borderBottom: '1px solid var(--border)', background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10 }}>
      <span className="display" style={{ fontSize: 'var(--text-h1)', fontWeight: 600 }}>upnext</span>
      {screen === 'board' ? (
        <>
          <button type="button" onClick={cycleRule} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 'var(--tap-min)', minWidth: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--radius-full)' }} aria-label="Change house rule">
            <StatusBadge status="neutral" label={RULE_LABEL[state.rule.template]} />
          </button>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: '20px', color: 'var(--text-secondary)' }}>
            {fmt((clock - state.startedAt) / 1000)}
          </span>
          <Button variant="secondary" onClick={() => void end()}>End session</Button>
        </>
      ) : screen === 'summary' ? (
        <>
          <span className="micro-label">Session summary</span>
          <span style={{ flex: 1 }} />
        </>
      ) : (
        <>
          <span className="micro-label">Open play</span>
          <span style={{ flex: 1 }} />
        </>
      )}
    </div>
  );

  if (resuming) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {header}
      {screen === 'setup' ? (
        <RosterSetup
          players={roster.players}
          onAddPlayer={(name) => void roster.addPlayer(name)}
          selected={selected}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onStart={(config) => void start(config)}
          onResume={(sessionId) => void session.loadById(sessionId).then(() => setScreen('board'))}
          onImport={(file) => void importSessionFile(file).then(() => window.location.reload()).catch(() => window.alert('Import failed: that is not a valid upnext session file'))}
        />
      ) : screen === 'board' ? (
        <SessionBoard
          state={state}
          players={roster.players}
          undoLabel={session.undoLabel}
          onUndo={() => void session.undo()}
          canRedo={session.canRedo}
          onRedo={() => void session.redo()}
          onFinish={(court) => void dispatch(cmd.finishGame(state, court))}
          onWin={(court, w) => void dispatch(cmd.finishGame(state, court, w))}
          onCloseCourt={(court) => void dispatch(cmd.closeCourt(state, court))}
          onReopenCourt={(court) => void dispatch(cmd.reopenCourt(state, court))}
          onToggleSit={(id) => void dispatch(state.sittingOut.includes(id) ? cmd.returnPlayer(state, id) : cmd.sitOutPlayer(state, id))}
          onToggleCheck={toggleBoardCheck}
          onSwap={swapPartners}
        />
      ) : (
        <SessionSummary
          state={state}
          players={roster.players}
          onExport={() => state.sessionId && void shareSessionFile(state.sessionId)}
          onDone={fresh}
        />
      )}
    </div>
  );
}
