/**
 * The courtside caller. A thin wrapper over the Web Speech API with no React in
 * it. Everything degrades to a no-op where speechSynthesis is missing, which is
 * what jsdom hands the test suite.
 */

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

export const isSupported = (): boolean => synth() !== null;

let cachedVoice: SpeechSynthesisVoice | null = null;
let watchingVoices = false;

function pickVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = s.getVoices();
  if (voices.length === 0) return null; // Chrome populates this later and fires voiceschanged
  const lang = (navigator.language || 'en-US').toLowerCase();
  const base = lang.split('-')[0];
  // a local voice keeps working when the gym wifi does not
  const local = voices.filter((v) => v.localService);
  const pool = local.length > 0 ? local : voices;
  return (
    pool.find((v) => v.lang.toLowerCase().replace('_', '-') === lang) ??
    pool.find((v) => v.lang.toLowerCase().startsWith(base)) ??
    pool.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    pool[0] ??
    null
  );
}

function voiceFor(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (!watchingVoices) {
    watchingVoices = true;
    s.addEventListener?.('voiceschanged', () => { cachedVoice = null; });
  }
  if (!cachedVoice) cachedVoice = pickVoice(s);
  return cachedVoice;
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
  primed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    s.speak(u);
  } catch {
    // unsupported or blocked: the real calls will be no-ops too
  }
}

/** Queued behind anything already speaking, so a finish and its refill read in order. */
export function speak(text: string): void {
  const s = synth();
  if (!s || !text) return;
  try {
    if (s.paused) s.resume(); // Chrome can strand the queue in a paused state
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceFor(s);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    s.speak(u);
  } catch {
    // a failed call must never take the board down
  }
}

/** Stops mid sentence. Used by the mute switch and on teardown. */
export function cancel(): void {
  try {
    synth()?.cancel();
  } catch {
    // nothing to do
  }
}
