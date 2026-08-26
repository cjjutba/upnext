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
    expect(result.current.undoLabel).toContain('court 1');
    await act(async () => {
      await result.current.undo();
    });
    await waitFor(() => expect(result.current.state.games[1]).toBeUndefined());
    expect(result.current.canRedo).toBe(true);
    await act(async () => {
      await result.current.redo();
    });
    await waitFor(() => expect(result.current.state.games[1]).toBeDefined());
  });
});
