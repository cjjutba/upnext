/**
 * The courtside caller. A thin wrapper over the Web Speech API with no React in
 * it. Everything degrades to a no-op where speechSynthesis is missing, which is
 * what jsdom hands the test suite.
 *
 * The browser's own queue is FIFO and infinite, which is the wrong shape for a
 * gym. Four courts finishing together queues more speech than the next half
 * minute can carry, and a court call that lands after the players have walked
 * on is worse than silence. So this module holds the queue itself, hands the
 * browser one utterance at a time, and throws away anything that has stopped
 * being true.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export const isSupported = (): boolean => synth() !== null;

const DANIEL_NAME = /^Daniel(?: \(English \((?:UK|United Kingdom)\)\))?$/;
const DANIEL_COMPACT_URI = 'com.apple.voice.compact.en-GB.Daniel';

function danielVoice(s = synth()): SpeechSynthesisVoice | undefined {
  const voices = s?.getVoices().filter((voice) =>
    voice.localService === true &&
    voice.lang.toLowerCase().replaceAll('_', '-') === 'en-gb' &&
    voice.voiceURI !== '' &&
    DANIEL_NAME.test(voice.name)
  ) ?? [];
  // WebKit exposes Apple voice IDs. Chromium may expose the display name.
  return voices.find((voice) => voice.voiceURI === DANIEL_COMPACT_URI) ??
    voices.sort((a, b) => a.voiceURI.localeCompare(b.voiceURI, 'en'))[0];
}

export const isDanielAvailable = (): boolean => danielVoice() !== undefined;

export function watchVoices(onChange: () => void): () => void {
  const s = synth();
  s?.addEventListener('voiceschanged', onChange);
  window.addEventListener('focus', onChange);
  onChange();
  return () => {
    s?.removeEventListener('voiceschanged', onChange);
    window.removeEventListener('focus', onChange);
  };
}

let primed = false;

/**
 * iOS Safari will not speak until one speak() call has run inside a real user
 * gesture, and every announcement here reaches the queue from an effect, one
 * task after the tap. A silent utterance from the first pointerdown unlocks it.
 */
export function prime(): void {
  const s = synth();
  if (!s || primed) return;
  const voice = danielVoice(s);
  if (!voice) return; // the next user gesture can retry after the browser lists its voices
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.voice = voice;
    u.lang = voice.lang;
    u.volume = 0;
    s.speak(u);
    primed = true;
  } catch {
    // unsupported or blocked: the real calls will be no-ops too
  }
}

export interface SpeakOptions {
  /**
   * What this announcement is about, normally a court. Queuing a second one
   * under the same key drops the first if it has not started: court 3 restaging
   * makes the un-spoken call for court 3 wrong, not merely late.
   */
  key?: string;
}

/**
 * How long an announcement stays worth saying. Measured, not guessed: after the
 * phrasing was shortened a result line runs about 2.3 seconds, so four courts
 * finishing at once queues roughly nine seconds of speech. Five seconds is the
 * point past which a call describes a board the players are already standing
 * on, and holding to it means the last of four gets dropped rather than said
 * seven seconds late. See docs/stress-test-2026-09-04.md.
 */
export const SHELF_LIFE_MS = 5000;

/** Rough speaking time, used only to unstick a queue whose end event never fires. */
const estimateMs = (text: string): number => Math.min(30000, 2000 + text.length * 80);

interface Queued {
  text: string;
  key?: string;
  queuedAt: number;
}

let queue: Queued[] = [];
let speaking = false;
let watchdog: ReturnType<typeof setTimeout> | null = null;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export type SpeechPhase = 'queued' | 'superseded' | 'dropped' | 'started' | 'ended' | 'failed';

/**
 * Lifecycle of every announcement, on window so a harness or a debug overlay
 * can count what was superseded and what went stale. Nothing in the app listens.
 */
function emit(phase: SpeechPhase, item: Queued): void {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('upnext:speech', {
      detail: { phase, key: item.key, text: item.text, waitedMs: Math.round(now() - item.queuedAt) },
    }));
  } catch {
    // diagnostics must never take the board down
  }
}

function clearWatchdog(): void {
  if (watchdog !== null) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

/** Speak the next thing still worth saying. One utterance is with the browser at a time. */
function pump(): void {
  const s = synth();
  if (!s || speaking) return;
  const t = now();
  while (queue.length > 0 && t - queue[0].queuedAt > SHELF_LIFE_MS) emit('dropped', queue.shift()!);
  const item = queue.shift();
  if (!item) return;
  const voice = danielVoice(s);
  if (!voice) {
    // Leaving the voice unset lets the browser select a network voice.
    emit('failed', item);
    pump();
    return;
  }
  try {
    if (s.paused) s.resume(); // Chrome can strand the queue in a paused state
    const u = new SpeechSynthesisUtterance(item.text);
    u.voice = voice;
    u.lang = voice.lang;
    speaking = true;
    const done = (phase: SpeechPhase) => {
      if (!speaking) return; // end after a cancel, or the watchdog racing a real end
      speaking = false;
      clearWatchdog();
      emit(phase, item);
      pump();
    };
    u.addEventListener('start', () => emit('started', item));
    u.addEventListener('end', () => done('ended'));
    u.addEventListener('error', () => done('failed'));
    // Chrome sometimes never fires end. A wrong guess costs one overlap; silence for the rest of the night costs the feature.
    watchdog = setTimeout(() => done('ended'), estimateMs(item.text));
    s.speak(u);
  } catch {
    speaking = false;
    clearWatchdog();
    pump();
  }
}

/**
 * Queue an announcement. Anything already mid sentence is left alone: a call cut
 * off halfway names two of four people, which is worse than the stale one.
 */
export function speak(text: string, opts: SpeakOptions = {}): void {
  const s = synth();
  if (!s || !text) return;
  if (opts.key !== undefined) {
    queue = queue.filter((q) => {
      if (q.key !== opts.key) return true;
      emit('superseded', q);
      return false;
    });
  }
  const item: Queued = { text, key: opts.key, queuedAt: now() };
  queue.push(item);
  emit('queued', item);
  pump();
}

/** Stops mid sentence and forgets what was waiting. Used by the mute switch and on teardown. */
export function cancel(): void {
  queue = [];
  speaking = false;
  clearWatchdog();
  try {
    synth()?.cancel();
  } catch {
    // nothing to do
  }
}
