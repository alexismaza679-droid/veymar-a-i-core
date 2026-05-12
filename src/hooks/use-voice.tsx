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

function stripForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " bloque de código omitido. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~>#]+/g, "")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function useSpeechRecognition(opts: {
  onFinal: (text: string) => void;
  lang?: string;
  continuous?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRecognition | null>(null);
  const wantRunningRef = useRef(false);
  const onFinalRef = useRef(opts.onFinal);
  onFinalRef.current = opts.onFinal;

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
    rec.continuous = !!opts.continuous;
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
        onFinalRef.current(finalText.trim());
      }
    };
    rec.onend = () => {
      setListening(false);
      if (wantRunningRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {}
      }
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        wantRunningRef.current = false;
      }
      setListening(false);
    };
    recRef.current = rec;
    return () => {
      wantRunningRef.current = false;
      try {
        rec.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.continuous, opts.lang]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    wantRunningRef.current = true;
    try {
      setInterim("");
      recRef.current.start();
      setListening(true);
    } catch {}
  }, []);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    wantRunningRef.current = false;
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
  const clean = stripForSpeech(text);
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.rate = 1;
  u.pitch = 1;
  const voices = synth.getVoices();
  const preferred =
    voices.find((v) => /es/i.test(v.lang) && /male|hombre|jorge|diego/i.test(v.name)) ||
    voices.find((v) => /es/i.test(v.lang)) ||
    voices[0];
  if (preferred) u.voice = preferred;
  synth.speak(u);
}

// Wake word matcher: "hey/ey/oye veymar ..."
const WAKE_RE = /\b(?:hey|ey|oye|hola)\s+veymar\b[\s,:.-]*/i;
export function extractWakeCommand(text: string): string | null {
  const m = text.match(WAKE_RE);
  if (!m) return null;
  const after = text.slice((m.index ?? 0) + m[0].length).trim();
  return after.length > 0 ? after : "";
}
