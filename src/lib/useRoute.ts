import { useCallback, useEffect, useState } from 'react';

export type Route = 'setup' | 'board' | 'summary';

const parse = (): Route => {
  const h = window.location.hash;
  if (h === '#/board') return 'board';
  if (h === '#/summary') return 'summary';
  return 'setup';
};

/** Hash routing: #/setup, #/board, #/summary. Back and forward work; no dependency. */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((r: Route) => {
    window.location.hash = '/' + r;
  }, []);
  return [route, navigate];
}
