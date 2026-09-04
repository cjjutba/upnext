import { useCallback, useEffect, useRef, useState } from 'react';
import * as speech from './speech';
import type { SpeakOptions } from './speech';

const KEY = 'upnext.speech.enabled';

/** On unless the organizer muted it. Reading throws in some private modes, so default loudly. */
const readStored = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export interface SpeechApi {
  enabled: boolean;
  supported: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
  /** No-op while muted. Referentially stable, so effects can depend on it. */
  speak: (text: string, opts?: SpeakOptions) => void;
  cancel: () => void;
}

export function useSpeech(): SpeechApi {
  const [enabled, setEnabledState] = useState(readStored);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    const onDown = () => speech.prime();
    window.addEventListener('pointerdown', onDown, { capture: true, once: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  // a sentence outliving the app would keep talking over whatever comes next
  useEffect(() => () => speech.cancel(), []);

  const setEnabled = useCallback((on: boolean) => {
    enabledRef.current = on; // set before state so a speak in this same tick sees it
    setEnabledState(on);
    try {
      window.localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // preference just will not survive the reload
    }
    if (on) speech.prime();
    else speech.cancel(); // muting stops the current sentence, it does not wait it out
  }, []);

  const toggle = useCallback(() => setEnabled(!enabledRef.current), [setEnabled]);
  const speak = useCallback((text: string, opts?: SpeakOptions) => {
    if (enabledRef.current) speech.speak(text, opts);
  }, []);

  return { enabled, supported: speech.isSupported(), setEnabled, toggle, speak, cancel: speech.cancel };
}
