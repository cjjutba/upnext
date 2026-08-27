import { useEffect, useRef } from 'react';
import { announceBatch, upNextPhrase, type NameOf } from '../domain/announce';
import type { Pairs, SessionEvent, SessionState } from '../domain/types';

/** Long enough that a burst of queue changes settles into one call, short enough to still feel live. */
const UP_NEXT_SETTLE_MS = 1200;

const fourKey = (pairs: Pairs | null): string | null =>
  pairs === null ? null : [...pairs[0], ...pairs[1]].slice().sort().join('|');

export interface AnnouncerInput {
  /** Events this device just appended. Empty means the log was loaded, not acted on. */
  lastBatch: SessionEvent[];
  state: SessionState;
  /** The board's up next preview. Null in the winners templates, where the next lineup depends on who wins. */
  nextUp: Pairs | null;
  nameOf: NameOf;
  speak: (text: string) => void;
  active: boolean;
}

/**
 * Turns board activity into speech. Two rules, and both hang off lastBatch:
 * appended events get read in order, and the up next four gets re-called when it
 * changes under a live action. A change with no batch behind it came from a
 * replay, so it seeds the tracker in silence.
 */
export function useAnnouncer({ lastBatch, state, nextUp, nameOf, speak, active }: AnnouncerInput): void {
  const spokenRef = useRef<SessionEvent[] | null>(null);
  const upNextRef = useRef<string | null>(null);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || lastBatch.length === 0) return;
    if (spokenRef.current === lastBatch) return; // strict mode runs effects twice; the same batch is not two batches
    spokenRef.current = lastBatch;
    for (const line of announceBatch(lastBatch, state, nameOf)) speak(line);
    // state and nameOf are read at the moment the batch lands, never re-read for an old one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBatch, active]);

  const key = fourKey(nextUp);
  useEffect(() => {
    if (!active) return;
    if (key === upNextRef.current) return;
    const live = lastBatch.length > 0;
    upNextRef.current = key;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    if (!live || key === null) return; // a replayed change seeds the tracker and says nothing
    const pairs = nextUp!;
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      if (upNextRef.current !== key) return; // the queue moved on while we waited
      speak(upNextPhrase(pairs, nameOf));
    }, UP_NEXT_SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  useEffect(() => () => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
  }, []);
}
