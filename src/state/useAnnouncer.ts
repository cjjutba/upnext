import { useEffect, useRef } from 'react';
import { announceBatch, type NameOf } from '../domain/announce';
import type { SessionEvent, SessionState } from '../domain/types';

export interface AnnouncerInput {
  /** Events this device just appended. Empty means the log was loaded, not acted on. */
  lastBatch: SessionEvent[];
  state: SessionState;
  nameOf: NameOf;
  speak: (text: string) => void;
  active: boolean;
}

/**
 * Turns board activity into speech. One rule, and it hangs off lastBatch:
 * appended events get read in order. A state change with no batch behind it
 * came from a replay and says nothing, which is what stops a resume from
 * reading back every court call of the session. Calling four people to a court
 * before the match starts is a button now, not a timer.
 */
export function useAnnouncer({ lastBatch, state, nameOf, speak, active }: AnnouncerInput): void {
  const spokenRef = useRef<SessionEvent[] | null>(null);

  useEffect(() => {
    if (!active || lastBatch.length === 0) return;
    if (spokenRef.current === lastBatch) return; // strict mode runs effects twice; the same batch is not two batches
    spokenRef.current = lastBatch;
    for (const line of announceBatch(lastBatch, state, nameOf)) speak(line);
    // state and nameOf are read at the moment the batch lands, never re-read for an old one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastBatch, active]);
}
