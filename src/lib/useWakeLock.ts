import { useEffect } from 'react';

/** Keep the screen on while the live board is up. Silently a no-op where unsupported. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type Lock = { release?: () => Promise<void> } | null;
    let lock: Lock = null;
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<NonNullable<Lock>> } }).wakeLock;
        if (wl) lock = await wl.request('screen');
      } catch {
        // denied or unsupported: nothing to do
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release?.();
    };
  }, [active]);
}
