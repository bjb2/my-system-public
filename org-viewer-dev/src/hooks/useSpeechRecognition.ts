import { useCallback, useRef, useState } from "react";

// Web Speech API types (not in all TS DOM lib versions)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList { length: number; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { isFinal: boolean; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

const PERMIT_KEY = "stt:permitted";

export interface SpeechHook {
  isListening: boolean;
  interim: string;
  start: (onFinal: (text: string) => void, onInterim?: (text: string) => void) => void;
  stop: () => void;
  needsPermit: boolean;
  acceptPermit: () => void;
  dismissPermit: () => void;
}

export function useSpeechRecognition(): SpeechHook {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [needsPermit, setNeedsPermit] = useState(false);
  const recRef = useRef<ISpeechRecognition | null>(null);
  const pendingRef = useRef<{ onFinal: (text: string) => void; onInterim?: (text: string) => void } | null>(null);

  const doStart = useCallback((onFinal: (text: string) => void, onInterim?: (text: string) => void) => {
    const w = window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SR: SpeechRecognitionCtor | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;

    if (recRef.current) { recRef.current.stop(); recRef.current = null; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    recRef.current = rec;

    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (interimText) { setInterim(interimText); onInterim?.(interimText); }
      if (finalText) {
        setInterim("");
        setIsListening(false);
        recRef.current = null;
        onFinal(finalText.trim());
      }
    };

    rec.onerror = () => { setIsListening(false); setInterim(""); recRef.current = null; };
    rec.onend = () => { setIsListening(false); setInterim(""); recRef.current = null; };

    rec.start();
    setIsListening(true);
  }, []);

  const start = useCallback((onFinal: (text: string) => void, onInterim?: (text: string) => void) => {
    // Toggle off if already listening
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      setIsListening(false);
      setInterim("");
      return;
    }
    if (!localStorage.getItem(PERMIT_KEY)) {
      pendingRef.current = { onFinal, onInterim };
      setNeedsPermit(true);
      return;
    }
    doStart(onFinal, onInterim);
  }, [doStart]);

  const acceptPermit = useCallback(() => {
    localStorage.setItem(PERMIT_KEY, "1");
    setNeedsPermit(false);
    if (pendingRef.current) {
      const { onFinal, onInterim } = pendingRef.current;
      pendingRef.current = null;
      doStart(onFinal, onInterim);
    }
  }, [doStart]);

  const dismissPermit = useCallback(() => {
    setNeedsPermit(false);
    pendingRef.current = null;
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setIsListening(false);
    setInterim("");
  }, []);

  return { isListening, interim, start, stop, needsPermit, acceptPermit, dismissPermit };
}
