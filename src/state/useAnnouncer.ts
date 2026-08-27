import { useEffect, useRef } from 'react';
import { announceBatch, challengersPhrase, upNextPhrase, type NameOf } from '../domain/announce';
import type { UpNextPreview } from '../domain/templates';
import type { SessionEvent, SessionState } from '../domain/types';

/** Long enough that a burst of queue changes settles into one call, short enough to still feel live. */
const UP_NEXT_SETTLE_MS = 1200;

/** The kind is part of the key: a lineup and a challenger pair are different calls even over the same people. */
const previewKey = (preview: UpNextPreview | null): string | null => {
  if (preview === null) return null;
  const players = preview.kind === 'lineup' ? [...preview.pairs[0], ...preview.pairs[1]] : preview.pair;
  return preview.kind + ':' + players.slice().sort().join('|');
};

const previewPhrase = (preview: UpNextPreview, nameOf: NameOf): string =>
  preview.kind === 'lineup' ? upNextPhrase(preview.pairs, nameOf) : challengersPhrase(preview.pair, nameOf);

export interface AnnouncerInput {
  /** Events this device just appended. Empty means the log was loaded, not acted on. */
  lastBatch: SessionEvent[];
  state: SessionState;
  /** The board's up next preview. A full lineup, or just the challengers in a winners template. */
  preview: UpNextPreview | null;
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
export function useAnnouncer({ lastBatch, state, preview, nameOf, speak, active }: AnnouncerInput): void {
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

  const key = previewKey(preview);
  useEffect(() => {
    if (!active) return;
    if (key === upNextRef.current) return;
    const live = lastBatch.length > 0;
    upNextRef.current = key;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    if (!live || key === null) return; // a replayed change seeds the tracker and says nothing
    const settled = preview!;
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      if (upNextRef.current !== key) return; // the queue moved on while we waited
      speak(previewPhrase(settled, nameOf));
    }, UP_NEXT_SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  useEffect(() => () => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
  }, []);
}
