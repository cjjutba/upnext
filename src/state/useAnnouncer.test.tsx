import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnnouncer, type AnnouncerInput } from './useAnnouncer';
import { replay } from '../domain/reducer';
import { startSession, finishGame, startStagedGame, type CommandEvent } from '../domain/commands';
import type { SessionEvent } from '../domain/types';

const nameOf = (id: string) => id.toUpperCase();

let n = 0;
const seal = (events: CommandEvent[]): SessionEvent[] =>
  events.map((e) => {
    n += 1;
    return { ...e, id: `evt-${String(n).padStart(6, '0')}`, deviceId: 'd', seq: n, ts: n, v: 1 } as SessionEvent;
  });

const BOOT = seal(startSession({ courts: 1, template: 'balanced', winCap: 2 }, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
/** The Start tap. Staging is silent, so this is the batch that carries the court call. */
const START = seal(startStagedGame(replay(BOOT), 1)!);
const LOG = [...BOOT, ...START];
const STATE = replay(LOG);

const setup = (over: Partial<AnnouncerInput> = {}) => {
  const speak = vi.fn();
  const props: AnnouncerInput = {
    lastBatch: [], state: STATE, nameOf, speak, active: true, ...over,
  };
  const view = renderHook((p: AnnouncerInput) => useAnnouncer(p), { initialProps: props });
  return { speak, ...view };
};

describe('useAnnouncer', () => {
  it('reads a batch this device just appended, keyed to the court it is about', () => {
    const { speak } = setup({ lastBatch: START });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toBe('Court 1. A, C, B, D.');
    expect(speak.mock.calls[0][1]).toEqual({ key: 'court-1' });
  });

  it('stays silent for a loaded log, which is what a resume hands it', () => {
    const { speak } = setup({ lastBatch: [] });
    expect(speak).not.toHaveBeenCalled();
  });

  it('stays silent while the board is not up', () => {
    const { speak } = setup({ lastBatch: START, active: false });
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not re-read the same batch on a re-render', () => {
    const { speak, rerender } = setup({ lastBatch: START });
    rerender({ lastBatch: START, state: STATE, nameOf, speak, active: true });
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('reads the next batch too', () => {
    const { speak, rerender } = setup({ lastBatch: START });
    const batch = seal(finishGame(STATE, 1, 0)!);
    const after = replay([...LOG, ...batch]);
    rerender({ lastBatch: batch, state: after, nameOf, speak, active: true });
    expect(speak).toHaveBeenCalledTimes(2); // the court call, then the win; the stage behind it is silent
    expect(speak.mock.calls[1][0]).toBe('Court 1. A and C win.');
    // both queue under one key, so the win replaces a court call still waiting to be said
    expect(speak.mock.calls[1][1]).toEqual({ key: 'court-1' });
  });

  it('says nothing for a batch that only stages a court', () => {
    const { speak } = setup({ lastBatch: BOOT });
    expect(speak).not.toHaveBeenCalled();
  });

});
