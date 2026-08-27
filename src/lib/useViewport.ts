import { useEffect, useState } from 'react';

/** Below this the two-column screens stack: phones, and tablets in a split view. */
const QUERY = '(max-width: 840px)';

const matches = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

/** True on narrow viewports. False where matchMedia is missing (jsdom), which keeps the wide layout. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
