import { useCallback, useEffect, useRef, useState } from 'react';
import * as speech from './speech';
import type { SpeakOptions } from './speech';

const KEY = 'upnext.speech.enabled';
const VOICE_KEY = 'upnext.speech.voice';

const readVoice = (): string => {
  try {
    return window.localStorage.getItem(VOICE_KEY) ?? '';
  } catch {
    return '';
  }
};

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
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  setVoiceURI: (uri: string) => void;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
  /** No-op while muted. Referentially stable, so effects can depend on it. */
  speak: (text: string, opts?: SpeakOptions) => void;
  cancel: () => void;
}

export function useSpeech(): SpeechApi {
  const [enabled, setEnabledState] = useState(readStored);
  const enabledRef = useRef(enabled);
  const [voiceURI, setVoiceState] = useState(readVoice);
  const voiceRef = useRef(voiceURI);
  const [voices, setVoices] = useState(() => speech.localVoices());

  useEffect(() => speech.watchVoices(() => setVoices(speech.localVoices())), []);

  useEffect(() => {
    const onDown = () => {
      if (enabledRef.current) speech.prime(voiceRef.current);
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
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
    if (on) speech.prime(voiceRef.current);
    else speech.cancel(); // muting stops the current sentence, it does not wait it out
  }, []);

  const setVoiceURI = (uri: string) => {
    voiceRef.current = uri;
    setVoiceState(uri);
    try {
      window.localStorage.setItem(VOICE_KEY, uri);
    } catch {
      // The voice still applies for this visit.
    }
  };

  const toggle = useCallback(() => setEnabled(!enabledRef.current), [setEnabled]);
  const speak = useCallback((text: string, opts?: SpeakOptions) => {
    if (enabledRef.current) speech.speak(text, opts, voiceRef.current);
  }, []);

  return {
    enabled, supported: speech.isSupported(), voices, voiceURI, setVoiceURI,
    setEnabled, toggle, speak, cancel: speech.cancel,
  };
}
