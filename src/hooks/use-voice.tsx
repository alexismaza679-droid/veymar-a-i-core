import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognition = any;

const STORAGE_KEY = "veymar.voice_owner";
const VOICE_SETTINGS_KEY = "veymar.voice_settings";

export type VeymarVoiceSettings = {
  rate: number; // 0.7 - 1.5
  pitch: number; // 0.5 - 1.2
  voiceName: string | null; // navegador SpeechSynthesisVoice.name
};

export const DEFAULT_VOICE_SETTINGS: VeymarVoiceSettings = {
  rate: 1.18, // ágil pero elegante (más lento que antes para sonar fino)
  pitch: 0.78, // grave, sigma, JARVIS-like
  voiceName: null,
};

export function getVoiceSettings(): VeymarVoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}
export function setVoiceSettings(s: Partial<VeymarVoiceSettings>) {
  const next = { ...getVoiceSettings(), ...s };
  localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

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

export function listSpanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang));
}

export function listAllVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

// Habla con una configuración puntual sin tocar los ajustes globales.
export async function speakWith(
  text: string,
  override: { rate?: number; pitch?: number; voiceName?: string | null; lang?: string },
) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const clean = stripForSpeech(text);
  if (!clean) return;
  const voices = await ensureVoices();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = override.lang || "es-ES";
  u.rate = override.rate ?? 1.05;
  u.pitch = override.pitch ?? 1.15;
  u.volume = 1;
  let chosen: SpeechSynthesisVoice | undefined;
  if (override.voiceName) chosen = voices.find((v) => v.name === override.voiceName);
  if (!chosen) {
    chosen =
      voices.find((v) => /female|mujer|helena|sabina|paulina|lucia|monica/i.test(v.name) && /^es/i.test(v.lang)) ||
      voices.find((v) => /^es/i.test(v.lang)) ||
      voices[0];
  }
  if (chosen) {
    u.voice = chosen;
    u.lang = chosen.lang || u.lang;
  }
  synth.speak(u);
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

// Asegura que las voces estén cargadas (Chrome las carga asíncronamente).
function ensureVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const v = synth.getVoices();
    if (v && v.length) return resolve(v);
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve(synth.getVoices() || []);
    };
    synth.addEventListener?.("voiceschanged", done as any, { once: true } as any);
    setTimeout(done, 1200);
  });
}

// Prime voices on first load.
if (typeof window !== "undefined" && window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch {}
}

export async function speak(text: string, lang = "es-ES") {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const clean = stripForSpeech(text);
  if (!clean) return;
  const settings = getVoiceSettings();
  const voices = await ensureVoices();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = lang;
  u.rate = settings.rate;
  u.pitch = settings.pitch;
  u.volume = 1;
  let chosen: SpeechSynthesisVoice | undefined;
  if (settings.voiceName) {
    chosen = voices.find((v) => v.name === settings.voiceName);
  }
  if (!chosen) {
    const isMale = (v: SpeechSynthesisVoice) =>
      /jorge|diego|carlos|enrique|miguel|pablo|juan|alvaro|male|hombre/i.test(v.name) &&
      !/female|mujer/i.test(v.name);
    chosen =
      voices.find((v) => /^es/i.test(v.lang) && isMale(v)) ||
      voices.find((v) => /^es-ES/i.test(v.lang) && /google/i.test(v.name)) ||
      voices.find((v) => /^es-MX|es-US|es-419/i.test(v.lang)) ||
      voices.find((v) => /^es/i.test(v.lang)) ||
      voices[0];
  }
  if (chosen) {
    u.voice = chosen;
    u.lang = chosen.lang || lang;
  }
  synth.speak(u);
}

// Wake word matcher: "hey/ey/oye/hola/okey veymar ..." (también capta "beymar/weimar")
const WAKE_RE = /\b(?:hey|ey|oye|hola|okey|ok)\s+(?:veymar|beymar|weimar|veimar|vey\s*mar)\b[\s,:.\-]*/i;
export function extractWakeCommand(text: string): string | null {
  const m = text.match(WAKE_RE);
  if (!m) return null;
  const after = text.slice((m.index ?? 0) + m[0].length).trim();
  return after.length > 0 ? after : "";
}
