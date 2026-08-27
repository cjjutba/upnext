import { useEffect, useState } from 'react';

/** Below this the two-column screens stack: phones, and tablets in a split view. */
const NARROW = '(max-width: 840px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** False where matchMedia is missing (jsdom), so both callers fall back to the plain wide, animated case. */
function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setOn(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return on;
}

/** True on narrow viewports. */
export function useNarrow(): boolean {
  return useMediaQuery(NARROW);
}

/**
 * True when the organizer's device asks for less motion. The rail is the only
 * thing in the app that moves, and this is what turns that off.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION);
}
