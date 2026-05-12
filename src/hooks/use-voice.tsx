import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognition = any;

const STORAGE_KEY = "veymar.voice_owner";

export function getVoiceOwner(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setVoiceOwner(name: string) {
  localStorage.setItem(STORAGE_KEY, name);
}

export function clearVoiceOwner() {
  localStorage.removeItem(STORAGE_KEY);
}

export function useSpeechRecognition(opts: {
  onFinal: (text: string) => void;
  lang?: string;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = opts.lang ?? "es-ES";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        opts.onFinal(finalText.trim());
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    if (!recRef.current) return;
    try {
      setInterim("");
      recRef.current.start();
      setListening(true);
    } catch {}
  }, []);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    try {
      recRef.current.stop();
    } catch {}
    setListening(false);
  }, []);

  return { listening, interim, supported, start, stop };
}

export function speak(text: string, lang = "es-ES") {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 1;
  u.pitch = 1;
  // Prefer a male / deeper voice if available
  const voices = synth.getVoices();
  const preferred =
    voices.find((v) => /es/i.test(v.lang) && /male|hombre|jorge|diego/i.test(v.name)) ||
    voices.find((v) => /es/i.test(v.lang)) ||
    voices[0];
  if (preferred) u.voice = preferred;
  synth.speak(u);
}
