import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { speak, cancel, isSupported, SHELF_LIFE_MS } from './speech';

/** Minimal stand-in for the Web Speech API. The test decides when a sentence ends. */
class FakeUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  volume = 1;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(text: string) { this.text = text; }
  addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
  fire(type: string) { for (const fn of this.listeners[type] ?? []) fn(); }
}

class FakeSynth {
  spoken: FakeUtterance[] = [];
  paused = false;
  speaking = false;
  pending = false;
  resumes = 0;
  cancels = 0;
  speak(u: FakeUtterance) { this.spoken.push(u); this.speaking = true; u.fire('start'); }
  resume() { this.resumes += 1; this.paused = false; }
  cancel() { this.cancels += 1; this.speaking = false; }
  getVoices() { return []; }
  addEventListener() { /* voiceschanged never fires here */ }
}

let synth: FakeSynth;
let clock: number;
let phases: Array<{ phase: string; key?: string; text: string }>;
const onSpeech = (e: Event) => phases.push((e as CustomEvent).detail);

const said = () => synth.spoken.map((u) => u.text);
const endLast = () => synth.spoken[synth.spoken.length - 1].fire('end');
const phasesOf = (phase: string) => phases.filter((p) => p.phase === phase).map((p) => p.text);

beforeEach(() => {
  synth = new FakeSynth();
  clock = 0;
  phases = [];
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  (globalThis as unknown as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
  window.addEventListener('upnext:speech', onSpeech);
  cancel(); // module level queue survives between tests
  synth.cancels = 0;
});

afterEach(() => {
  window.removeEventListener('upnext:speech', onSpeech);
  cancel();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('speech queue', () => {
  it('reports support from the browser it is given', () => {
    expect(isSupported()).toBe(true);
  });

  it('hands the browser one utterance at a time, in order', () => {
    speak('one');
    speak('two');
    speak('three');
    expect(said()).toEqual(['one']);
    endLast();
    expect(said()).toEqual(['one', 'two']);
    endLast();
    expect(said()).toEqual(['one', 'two', 'three']);
  });

  it('replaces a waiting announcement when a newer one is about the same court', () => {
    speak('court 1 starting', { key: 'court-1' });
    speak('court 2 starting', { key: 'court-2' });
    speak('court 1 finished', { key: 'court-1' });
    endLast(); // "court 1 starting" was already in the air
    expect(said()).toEqual(['court 1 starting', 'court 2 starting']);
    endLast();
    expect(said()).toEqual(['court 1 starting', 'court 2 starting', 'court 1 finished']);
    expect(phasesOf('superseded')).toEqual([]);
  });

  it('drops the pending one it supersedes rather than saying both', () => {
    speak('holding', { key: 'court-3' });   // starts at once
    speak('stale call', { key: 'court-3' }); // waits
    speak('fresh call', { key: 'court-3' }); // replaces the waiting one
    expect(phasesOf('superseded')).toEqual(['stale call']);
    endLast();
    expect(said()).toEqual(['holding', 'fresh call']);
  });

  it('never cuts off a sentence that has already started', () => {
    speak('mid sentence', { key: 'court-1' });
    speak('newer', { key: 'court-1' });
    expect(synth.cancels).toBe(0);
    expect(said()).toEqual(['mid sentence']);
  });

  it('throws away an announcement that waited longer than its shelf life', () => {
    speak('first');
    speak('too late');
    clock += SHELF_LIFE_MS + 1;
    endLast();
    expect(said()).toEqual(['first']);
    expect(phasesOf('dropped')).toEqual(['too late']);
  });

  it('keeps one that is still inside its shelf life, and drops only what is past it', () => {
    speak('first');
    speak('still fresh');
    clock += SHELF_LIFE_MS - 100;
    speak('newer still');
    clock += 200; // "still fresh" is now stale, "newer still" is not
    endLast();
    expect(said()).toEqual(['first', 'newer still']);
    expect(phasesOf('dropped')).toEqual(['still fresh']);
  });

  it('advances when the browser never fires end, so one stuck sentence is not the rest of the night', () => {
    speak('stuck');
    speak('next');
    expect(said()).toEqual(['stuck']);
    vi.advanceTimersByTime(2000 + 'stuck'.length * 80 + 1);
    expect(said()).toEqual(['stuck', 'next']);
  });

  it('resumes a queue Chrome left paused', () => {
    synth.paused = true;
    speak('anything');
    expect(synth.resumes).toBe(1);
  });

  it('forgets everything waiting when the organizer mutes', () => {
    speak('first');
    speak('second');
    cancel();
    expect(synth.cancels).toBe(1);
    endLast(); // a late end from the cancelled utterance must not restart the queue
    expect(said()).toEqual(['first']);
  });

  it('reports the whole lifecycle so a harness can count what was dropped', () => {
    speak('hello', { key: 'court-1' });
    endLast();
    expect(phases.map((p) => p.phase)).toEqual(['queued', 'started', 'ended']);
    expect(phases[0].key).toBe('court-1');
  });

  it('is a no-op where the browser has no speech synthesis', () => {
    // jsdom is this case in production: the property is absent, not undefined
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    expect(isSupported()).toBe(false);
    expect(() => speak('nobody hears this')).not.toThrow();
  });
});
