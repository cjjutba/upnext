import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSession } from './useSession';
import { startSession } from '../domain/commands';

describe('useSession', () => {
  it('dispatches commands, replays state, and undoes', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.dispatch(startSession({ courts: 1, template: 'all-off', winCap: 3 }, ['a', 'b', 'c', 'd', 'e']));
    });
    await waitFor(() => expect(result.current.state.started).toBe(true));
    expect(result.current.state.games[1]).toBeDefined();
    expect(result.current.state.queue).toEqual(['e']);
    // undo targets the newest primary action (e's check-in), never the fill; the fill of a-d survives
    expect(result.current.undoLabel).toContain('check-in');
    await act(async () => {
      await result.current.undo();
    });
    await waitFor(() => expect(result.current.state.queue).toEqual([]));
    expect(result.current.state.games[1]).toBeDefined();
    expect(result.current.canRedo).toBe(true);
    await act(async () => {
      await result.current.redo();
    });
    await waitFor(() => expect(result.current.state.queue).toEqual(['e']));
  });

  it('concurrent dispatches keep the in-memory log in canonical order', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.dispatch(startSession({ courts: 1, template: 'all-off', winCap: 3 }, ['a', 'b']));
    });
    const sid = result.current.events[0].sessionId;
    await act(async () => {
      const p1 = result.current.dispatch([
        { type: 'player-checked-in', playerId: 'c', sessionId: sid },
        { type: 'player-checked-in', playerId: 'd', sessionId: sid },
      ]);
      const p2 = result.current.dispatch([{ type: 'player-checked-in', playerId: 'e', sessionId: sid }]);
      await Promise.all([p1, p2]);
    });
    const ids = result.current.events.map((e) => e.id);
    expect([...ids].sort()).toEqual(ids);
    expect(result.current.state.queue).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('a double tap on undo produces two clean sequential undos and redo recovers one', async () => {
    const { result } = renderHook(() => useSession());
    await act(async () => {
      await result.current.dispatch(startSession({ courts: 1, template: 'all-off', winCap: 3 }, ['a', 'b', 'c', 'd', 'e']));
    });
    await waitFor(() => expect(result.current.state.games[1]).toBeDefined());
    await act(async () => {
      await Promise.all([result.current.undo(), result.current.undo()]);
    });
    // first undo removed e's check-in; the second removed d's, which dissolves the fill that needed d
    await waitFor(() => expect(result.current.state.games[1]).toBeUndefined());
    expect(result.current.state.queue).toEqual(['a', 'b', 'c']);
    await act(async () => {
      await result.current.redo();
    });
    // redo reinstates d's check-in, which revalidates the fill of a-d
    await waitFor(() => expect(result.current.state.games[1]).toBeDefined());
    expect(result.current.state.queue).toEqual([]);
  });
});
