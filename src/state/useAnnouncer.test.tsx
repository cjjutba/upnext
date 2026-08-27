import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnnouncer, type AnnouncerInput } from './useAnnouncer';
import { replay } from '../domain/reducer';
import { startSession, finishGame, type CommandEvent } from '../domain/commands';
import type { UpNextPreview } from '../domain/templates';
import type { Pairs, SessionEvent } from '../domain/types';

const nameOf = (id: string) => id.toUpperCase();

let n = 0;
const seal = (events: CommandEvent[]): SessionEvent[] =>
  events.map((e) => {
    n += 1;
    return { ...e, id: `evt-${String(n).padStart(6, '0')}`, deviceId: 'd', seq: n, ts: n, v: 1 } as SessionEvent;
  });

const LOG = seal(startSession({ courts: 1, template: 'balanced', winCap: 2 }, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
const STATE = replay(LOG);

const setup = (over: Partial<AnnouncerInput> = {}) => {
  const speak = vi.fn();
  const props: AnnouncerInput = {
    lastBatch: [], state: STATE, preview: null, nameOf, speak, active: true, ...over,
  };
  const view = renderHook((p: AnnouncerInput) => useAnnouncer(p), { initialProps: props });
  return { speak, ...view };
};

describe('useAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads a batch this device just appended', () => {
    const { speak } = setup({ lastBatch: LOG });
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toContain('Please proceed to court 1');
  });

  it('stays silent for a loaded log, which is what a resume hands it', () => {
    const { speak } = setup({ lastBatch: [] });
    expect(speak).not.toHaveBeenCalled();
  });

  it('stays silent while the board is not up', () => {
    const { speak } = setup({ lastBatch: LOG, active: false });
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not re-read the same batch on a re-render', () => {
    const { speak, rerender } = setup({ lastBatch: LOG });
    rerender({ lastBatch: LOG, state: STATE, preview: null, nameOf, speak, active: true });
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('reads the next batch too', () => {
    const { speak, rerender } = setup({ lastBatch: LOG });
    const batch = seal(finishGame(STATE, 1, 0)!);
    const after = replay([...LOG, ...batch]);
    rerender({ lastBatch: batch, state: after, preview: null, nameOf, speak, active: true });
    expect(speak).toHaveBeenCalledTimes(3); // the first court call, then the win and its refill
    expect(speak.mock.calls[1][0]).toBe('Court 1. A and C win.');
  });

  it('calls the up next four once the queue settles', () => {
    const four: UpNextPreview = { kind: 'lineup', pairs: [['e', 'f'], ['g', 'h']] as Pairs };
    const { speak, rerender } = setup({ lastBatch: [], preview: null });
    rerender({ lastBatch: LOG, state: STATE, preview: four, nameOf, speak, active: true });
    speak.mockClear();
    expect(speak).not.toHaveBeenCalled(); // still inside the settle window
    act(() => void vi.advanceTimersByTime(1500));
    expect(speak).toHaveBeenCalledWith('Up next. E and F versus G and H. Please get ready.');
  });

  it('calls the challengers instead when a winners template is the one previewing', () => {
    const two: UpNextPreview = { kind: 'challengers', pair: ['e', 'f'] };
    const { speak, rerender } = setup({ lastBatch: [], preview: null });
    rerender({ lastBatch: LOG, state: STATE, preview: two, nameOf, speak, active: true });
    speak.mockClear();
    act(() => void vi.advanceTimersByTime(1500));
    expect(speak).toHaveBeenCalledWith('Next challengers. E and F. Please get ready.');
  });

  it('re-calls when a mode switch changes the shape of the preview over the same people', () => {
    const lineup: UpNextPreview = { kind: 'lineup', pairs: [['e', 'f'], ['g', 'h']] as Pairs };
    const { speak, rerender } = setup({ lastBatch: LOG, preview: lineup });
    act(() => void vi.advanceTimersByTime(1500));
    speak.mockClear();
    rerender({ lastBatch: LOG, state: STATE, preview: { kind: 'challengers', pair: ['e', 'f'] }, nameOf, speak, active: true });
    act(() => void vi.advanceTimersByTime(1500));
    expect(speak).toHaveBeenCalledWith('Next challengers. E and F. Please get ready.');
  });

  it('seeds the up next tracker in silence when the change came from a load', () => {
    const four: UpNextPreview = { kind: 'lineup', pairs: [['e', 'f'], ['g', 'h']] as Pairs };
    const { speak, rerender } = setup({ lastBatch: [], preview: null });
    rerender({ lastBatch: [], state: STATE, preview: four, nameOf, speak, active: true });
    act(() => void vi.advanceTimersByTime(1500));
    expect(speak).not.toHaveBeenCalled();
  });

  it('a change inside the settle window replaces the pending call, it does not stack', () => {
    const first: UpNextPreview = { kind: 'lineup', pairs: [['e', 'f'], ['g', 'h']] as Pairs };
    const second: UpNextPreview = { kind: 'lineup', pairs: [['a', 'b'], ['c', 'd']] as Pairs };
    const { speak, rerender } = setup({ lastBatch: [], preview: null });
    rerender({ lastBatch: LOG, state: STATE, preview: first, nameOf, speak, active: true });
    act(() => void vi.advanceTimersByTime(400));
    rerender({ lastBatch: LOG, state: STATE, preview: second, nameOf, speak, active: true });
    speak.mockClear();
    act(() => void vi.advanceTimersByTime(1500));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('Up next. A and B versus C and D. Please get ready.');
  });
});
