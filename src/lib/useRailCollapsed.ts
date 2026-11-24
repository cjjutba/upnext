import { useCallback, useState } from 'react';

const KEY = 'upnext.rail.collapsed';

/** Expanded unless the organizer hid the rail. Reading throws in some private modes, so default to showing it. */
const readStored = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

/**
 * Whether the board's check-in rail is hidden. A device preference, not
 * session truth: it never belongs in the event log, so it lives beside the
 * mute switch in localStorage.
 */
export function useRailCollapsed(): { collapsed: boolean; toggle: () => void; expand: () => void } {
  const [collapsed, setCollapsed] = useState(readStored);
  const update = useCallback((next?: boolean) => {
    setCollapsed((was) => {
      const now = next ?? !was;
      if (now === was) return was;
      try {
        window.localStorage.setItem(KEY, now ? 'on' : 'off');
      } catch {
        // preference just will not survive the reload
      }
      return now;
    });
  }, []);
  const toggle = useCallback(() => update(), [update]);
  const expand = useCallback(() => update(false), [update]);
  return { collapsed, toggle, expand };
}
