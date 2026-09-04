import { useEffect, useMemo, useState } from 'react';
import { SessionBoard } from '../screens/SessionBoard';
import { PlayerPicker } from '../components/PlayerPicker';
import { LineupEditor } from '../components/LineupEditor';
import { attendanceRecency } from '../db/eventStore';
import { useAnnouncer } from '../state/useAnnouncer';
import { useWakeLock } from '../lib/useWakeLock';
import { useMisrouteGuard, type Navigate } from '../lib/useRoute';
import * as cmd from '../domain/commands';
import type { CommandEvent } from '../domain/commands';
import { previewLineups, type Ratings } from '../domain/templates';
import { challengersPhrase, courtKey, getReadyPhrase, matchReadyPhrase } from '../domain/announce';
import type { SpeakOptions } from '../lib/speech';
import { isStaged, stagedCourtOf } from '../domain/reducer';
import { fullLineup, slotAt } from '../domain/types';
import type { Player, SessionEvent, SessionState, SlotIndex } from '../domain/types';

interface BoardRouteProps {
  state: SessionState;
  players: Player[];
  ratings: Ratings;
  dispatch: (commands: CommandEvent[] | null) => Promise<void>;
  addPlayer: (name: string) => Promise<Player | null>;
  undoLabel: string | null;
  onUndo: () => void;
  canRedo: boolean;
  onRedo: () => void;
  lastBatch: SessionEvent[];
  speak: (text: string, opts?: SpeakOptions) => void;
  resuming: boolean;
  navigate: Navigate;
  narrow: boolean;
  railCollapsed: boolean;
  motion: boolean;
}

export function BoardRoute({
  state, players, ratings, dispatch, addPlayer, undoLabel, onUndo, canRedo, onRedo, lastBatch, speak,
  resuming, navigate, narrow, railCollapsed, motion,
}: BoardRouteProps) {
  const [picking, setPicking] = useState<{ playerId: string; court: number | null } | null>(null);
  const [editingCourt, setEditingCourt] = useState<number | null>(null);
  const [recency, setRecency] = useState<Record<string, number>>({});

  useEffect(() => {
    void attendanceRecency().then(setRecency);
  }, []);

  useWakeLock(true);

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Unknown';
  const previews = useMemo(() => previewLineups(state, ratings), [state, ratings]);

  useAnnouncer({
    lastBatch,
    state,
    nameOf,
    speak,
    // names come from the roster, so wait for it rather than calling four Unknowns to a court
    active: players.length > 0,
  });

  const target = !state.started ? 'setup' : null;
  useMisrouteGuard(resuming, target, navigate);

  if (target) return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;

  // On the board a tap checks a player in, or removes a waiting or staged one. Players mid game are untouchable.
  const toggleBoardCheck = (playerId: string) => {
    if (state.queue.includes(playerId) || isStaged(state, playerId)) void dispatch(cmd.departPlayer(state, playerId));
    else void dispatch(cmd.checkInPlayer(state, playerId, ratings));
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
    ? players.filter((p) => state.queue.includes(p.id) && !state.sittingOut.includes(p.id) && p.id !== picking.playerId)
    : [];

  const addAndCheckIn = async (name: string) => {
    const player = await addPlayer(name);
    if (player) await dispatch(cmd.checkInPlayer(state, player.id, ratings));
  };

  const createAndSeat = async (court: number, slot: SlotIndex, name: string) => {
    const player = await addPlayer(name);
    // addPlayer refuses a duplicate name, so a collision leaves the seat open rather than seating the wrong person
    if (player) await dispatch(cmd.seatPlayer(state, court, slot, player.id, ratings));
  };

  return (
    <>
      <SessionBoard
        state={state}
        players={players}
        undoLabel={undoLabel}
        actionId={lastBatch.at(-1)?.id ?? null}
        onUndo={onUndo}
        canRedo={canRedo}
        onRedo={onRedo}
        onWin={(court, w) => void dispatch(cmd.finishGame(state, court, w, ratings))}
        onCloseCourt={(court) => void dispatch(cmd.closeCourt(state, court, ratings))}
        onToggleSit={(id) => void dispatch(state.sittingOut.includes(id) ? cmd.returnPlayer(state, id, ratings) : cmd.sitOutPlayer(state, id))}
        onToggleCheck={toggleBoardCheck}
        onAddCourt={() => void dispatch(cmd.addCourt(state, ratings))}
        onAddPlayer={(n) => void addAndCheckIn(n)}
        onRemovePlayer={(id) => void dispatch(cmd.departPlayer(state, id))}
        onCourtPlayerTap={(court, id) => setPicking({ playerId: id, court })}
        onQueuePlayerTap={(id) => setPicking({ playerId: id, court: null })}
        onStart={(court) => void dispatch(cmd.startStagedGame(state, court))}
        onStage={(court) => void dispatch(cmd.stageCourt(state, court, ratings))}
        onCallCourt={(court) => {
          const lineup = state.staged[court] ?? state.games[court]?.pairs;
          const pairs = lineup && fullLineup(lineup);
          if (pairs) speak(getReadyPhrase(pairs, nameOf, court), { key: courtKey(court) });
        }}
        onCallPreview={(i) => {
          const next = previews[i];
          if (next) speak(next.kind === 'lineup' ? matchReadyPhrase(next.pairs, nameOf, i) : challengersPhrase(next.pair, nameOf));
        }}
        onEditLineup={setEditingCourt}
        previews={previews}
        narrow={narrow}
        railCollapsed={railCollapsed}
        motion={motion}
        recency={recency}
        onSeatPlayer={(court, slot, id) => void dispatch(cmd.seatPlayer(state, court, slot, id, ratings))}
        onCreateAndSeat={(court, slot, name) => void createAndSeat(court, slot, name)}
        onFillCourt={(court) => void dispatch(cmd.fillCourt(state, court, ratings))}
      />
      {picking ? (
        <PlayerPicker
          name={nameOf(picking.playerId)}
          context={pickerContext(picking.playerId)}
          candidates={candidates}
          sitting={state.sittingOut.includes(picking.playerId)}
          onSwap={swapPicked}
          onSit={() => {
            void dispatch(state.sittingOut.includes(picking.playerId)
              ? cmd.returnPlayer(state, picking.playerId, ratings)
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
    </>
  );
}
