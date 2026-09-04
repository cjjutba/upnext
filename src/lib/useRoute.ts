import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'resolve' }
  | { name: 'setup' }
  | { name: 'board' }
  | { name: 'summary' }
  | { name: 'session'; id: string };

export type Navigate = (r: Route, opts?: { replace?: boolean }) => void;

/** Exported for useRoute.test.ts; not meant to be called outside this module otherwise. */
export function parse(pathname: string): Route {
  if (pathname === '/app' || pathname === '/app/') return { name: 'resolve' };
  if (pathname === '/app/setup') return { name: 'setup' };
  if (pathname === '/app/board') return { name: 'board' };
  if (pathname === '/app/summary') return { name: 'summary' };
  const m = /^\/app\/session\/([^/]+)\/?$/.exec(pathname);
  if (m) return { name: 'session', id: decodeURIComponent(m[1]) };
  // An unrecognized /app path self-heals to resolve rather than rendering nothing.
  return { name: 'resolve' };
}

function toPath(r: Route): string {
  if (r.name === 'resolve') return '/app';
  if (r.name === 'session') return `/app/session/${encodeURIComponent(r.id)}`;
  return `/app/${r.name}`;
}

/**
 * History API routing under /app: pushState/replaceState, a popstate listener, and
 * same-document link interception. No dependency; this hook must be called exactly
 * once (in App.tsx) since the popstate listener and click interceptor are global.
 */
export function useRoute(): [Route, Navigate] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parse(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback<Navigate>((r, opts) => {
    const path = toPath(r);
    if (path === window.location.pathname) return;
    if (opts?.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setRoute(r);
  }, []);

  useEffect(() => {
    // A link to "/" (a different document entirely) or off-origin always gets a real navigation.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.('a');
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/app')) return;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      window.history.pushState(null, '', url.pathname);
      setRoute(parse(url.pathname));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return [route, navigate];
}

/** Redirects (replace) to `target` once resuming has finished, unless target is null. */
export function useMisrouteGuard(resuming: boolean, target: 'setup' | 'board' | null, navigate: Navigate) {
  useEffect(() => {
    if (!resuming && target) navigate({ name: target }, { replace: true });
  }, [resuming, target, navigate]);
}
