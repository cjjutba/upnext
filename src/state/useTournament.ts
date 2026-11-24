import { useEffect, useRef, useState } from 'react';
import {
  createTournament, dispatchTournament, exportTournament, importTournament, listTournaments, loadTournament,
} from '../db/tournamentStore';
import { advanceTournament, TournamentCommandError } from '../domain/tournament';
import type { TournamentAction, TournamentMatch, TournamentState } from '../domain/tournament';
import { newId } from '../lib/ids';

type Listing = Awaited<ReturnType<typeof listTournaments>>[number];
export type TournamentFailure = Pick<TournamentCommandError, 'code' | 'matchIds' | 'message'>;
export type CorrectionAction = Extract<TournamentAction, { type: 'correct-result' }>;

export interface CorrectionPreview {
  changes: { before: TournamentMatch; after: TournamentMatch }[];
  affectedIds: string[];
  error?: string;
}

export function reviewTournamentCorrection(state: TournamentState, action: CorrectionAction): CorrectionPreview {
  const edition = { v: 1 as const, id: 'correction-preview', tournamentId: state.id, ts: Date.now(), seq: state.revision + 1 };
  const apply = (draft: CorrectionAction) => advanceTournament(state, { ...edition, action: draft });
  let next: TournamentState;
  let affectedIds: string[] = [];
  try {
    next = apply(action);
  } catch (error) {
    if (!(error instanceof TournamentCommandError)) throw error;
    if (error.code !== 'qualifier-conflict') return { changes: [], affectedIds, error: error.message };
    affectedIds = error.matchIds;
    next = apply({ ...action, resolution: { policy: 'reset-affected', reason: 'Review qualifier changes' } });
  }

  const current = new Map(state.divisions[action.divisionId].matches.map((match) => [match.id, match]));
  const changes = next.divisions[action.divisionId].matches.flatMap((after) => {
    const before = current.get(after.id);
    if (!before || before.id === action.matchId || JSON.stringify(before.teamIds) === JSON.stringify(after.teamIds)) return [];
    return [{ before, after }];
  });
  return { changes, affectedIds };
}

export function useTournament() {
  const [state, setState] = useState<TournamentState | null>(null);
  const [list, setList] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TournamentFailure | null>(null);
  const operation = useRef(false);

  const report = (error: unknown) => {
    if (error instanceof TournamentCommandError) {
      setFailure({ code: error.code, message: error.message, matchIds: error.matchIds });
    } else {
      setFailure({
        code: 'invalid-action', matchIds: [],
        message: error instanceof Error ? error.message : 'The tournament could not be saved on this device.',
      });
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const tournaments = await listTournaments();
        const opened = tournaments.length === 1 ? await loadTournament(tournaments[0].id) : null;
        if (active) {
          setList(tournaments);
          setState(opened);
        }
      } catch (error) {
        if (active) report(error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    if (operation.current) return false;
    operation.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      return true;
    } catch (error) {
      report(error);
      return false;
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const save = (action: TournamentAction) => run(async () => {
    if (!state) return;
    try {
      setState(await dispatchTournament(state.id, action, { requestId: newId(), expectedRevision: state.revision }));
    } catch (error) {
      if (error instanceof TournamentCommandError && error.code === 'stale-revision') {
        const current = await loadTournament(state.id);
        if (current) setState(current);
      }
      throw error;
    }
  });

  return {
    state, list, loading, busy, failure, save,
    clearFailure: () => setFailure(null),
    report,
    create: () => run(async () => {
      setState(await createTournament());
      setList(await listTournaments());
    }),
    open: (id: string) => run(async () => {
      const opened = await loadTournament(id);
      if (!opened) throw new Error('This tournament is no longer available on this device.');
      setState(opened);
    }),
    close: () => run(async () => {
      setList(await listTournaments());
      setState(null);
    }),
    backup: (receive: (backup: Awaited<ReturnType<typeof exportTournament>>) => void) => run(async () => {
      if (state) receive(await exportTournament(state.id));
    }),
    restore: (data: unknown) => run(async () => {
      setState(await importTournament(data));
      setList(await listTournaments());
    }),
  };
}
