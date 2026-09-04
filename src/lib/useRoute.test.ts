import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { parse, useRoute, useMisrouteGuard } from './useRoute';

beforeEach(() => {
  window.history.replaceState(null, '', '/app');
});

afterEach(cleanup);

describe('parse', () => {
  it('reads all five route shapes', () => {
    expect(parse('/app')).toEqual({ name: 'resolve' });
    expect(parse('/app/')).toEqual({ name: 'resolve' });
    expect(parse('/app/setup')).toEqual({ name: 'setup' });
    expect(parse('/app/board')).toEqual({ name: 'board' });
    expect(parse('/app/summary')).toEqual({ name: 'summary' });
    expect(parse('/app/session/abc-123')).toEqual({ name: 'session', id: 'abc-123' });
  });

  it('falls back to resolve on an unrecognized path, so it self heals instead of rendering nothing', () => {
    expect(parse('/app/nope')).toEqual({ name: 'resolve' });
    expect(parse('/app/session/')).toEqual({ name: 'resolve' });
  });
});

describe('useRoute', () => {
  it('starts from the current pathname', () => {
    window.history.replaceState(null, '', '/app/board');
    const { result } = renderHook(() => useRoute());
    expect(result.current[0]).toEqual({ name: 'board' });
  });

  it('push adds a history entry and updates the path; replace does neither', () => {
    const { result } = renderHook(() => useRoute());
    const before = window.history.length;

    act(() => result.current[1]({ name: 'setup' }));
    expect(window.location.pathname).toBe('/app/setup');
    expect(window.history.length).toBe(before + 1);

    act(() => result.current[1]({ name: 'board' }, { replace: true }));
    expect(window.location.pathname).toBe('/app/board');
    expect(window.history.length).toBe(before + 1);
  });

  it('re-derives the route on popstate, the way browser Back arrives', () => {
    const { result } = renderHook(() => useRoute());
    act(() => {
      window.history.pushState(null, '', '/app/setup');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0]).toEqual({ name: 'setup' });
  });

  it('intercepts a same-document /app link, preventing the reload and pushing instead', () => {
    const { result } = renderHook(() => useRoute());
    const a = document.createElement('a');
    a.href = '/app/board';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { a.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(window.location.pathname).toBe('/app/board');
    expect(result.current[0]).toEqual({ name: 'board' });
    document.body.removeChild(a);
  });

  it('leaves a link back to the landing page alone, a different document entirely', () => {
    renderHook(() => useRoute());
    const a = document.createElement('a');
    a.href = '/';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { a.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(a);
  });

  it('leaves an external link alone', () => {
    renderHook(() => useRoute());
    const a = document.createElement('a');
    a.href = 'https://example.com/';
    document.body.appendChild(a);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => { a.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(a);
  });
});

describe('useMisrouteGuard', () => {
  it('replace-navigates once resuming has finished and a target is set', () => {
    const navigate = vi.fn();
    renderHook(() => useMisrouteGuard(false, 'setup', navigate));
    expect(navigate).toHaveBeenCalledWith({ name: 'setup' }, { replace: true });
  });

  it('stays quiet while resuming, even with a target set', () => {
    const navigate = vi.fn();
    renderHook(() => useMisrouteGuard(true, 'setup', navigate));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays quiet with no target', () => {
    const navigate = vi.fn();
    renderHook(() => useMisrouteGuard(false, null, navigate));
    expect(navigate).not.toHaveBeenCalled();
  });
});
