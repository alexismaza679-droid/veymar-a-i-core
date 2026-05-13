// VEYMAR — Núcleo offline local.
// Responde sin conexión usando lógica determinista, conocimiento embebido
// y caché de respuestas previas en localStorage.

const CACHE_KEY = "veymar.offline_cache";

type CacheEntry = { q: string; a: string; ts: number };

function loadCache(): CacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveCache(entries: CacheEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(-200)));
}

export function rememberAnswer(question: string, answer: string) {
  const c = loadCache();
  c.push({ q: question.toLowerCase().trim(), a: answer, ts: Date.now() });
  saveCache(c);
}

function fuzzyMatch(a: string, b: string) {
  const sa = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const sb = new Set(b.split(/\s+/).filter((w) => w.length > 3));
  if (!sa.size || !sb.size) return 0;
  let hit = 0;
  sa.forEach((w) => sb.has(w) && hit++);
  return hit / Math.max(sa.size, sb.size);
}

function lookupCache(q: string): string | null {
  const norm = q.toLowerCase().trim();
  const c = loadCache();
  // exact
  const exact = c.find((e) => e.q === norm);
  if (exact) return exact.a;
  // fuzzy
  let best: { score: number; a: string } | null = null;
  for (const e of c) {
    const s = fuzzyMatch(norm, e.q);
    if (s > 0.6 && (!best || s > best.score)) best = { score: s, a: e.a };
  }
  return best?.a ?? null;
}

const TWO = (n: number) => n.toString().padStart(2, "0");

export function offlineRespond(input: string, ownerName?: string | null): string | null {
  const q = input.toLowerCase().trim();
  if (!q) return null;
  const greet = ownerName ? `, ${ownerName}` : "";

  // Hora
  if (/\b(qu[eé]\s+hora|hora\s+es|dime\s+la\s+hora)\b/.test(q)) {
    const d = new Date();
    return `Son las ${TWO(d.getHours())}:${TWO(d.getMinutes())}${greet}.`;
  }

  // Fecha
  if (/\b(qu[eé]\s+(d[ií]a|fecha)|fecha\s+de\s+hoy|hoy\s+es|d[ií]a\s+es)\b/.test(q)) {
    const d = new Date();
    const fmt = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    return `Hoy es ${fmt}${greet}.`;
  }

  // Saludos
  if (/\b(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey\s+veymar|qu[eé]\s+tal)\b/.test(q)) {
    const d = new Date().getHours();
    const periodo = d < 12 ? "Buenos días" : d < 19 ? "Buenas tardes" : "Buenas noches";
    return `${periodo}${greet}. Modo offline activo: dispongo de funciones locales mientras restablece la conexión.`;
  }

  // Identidad / creador
  if (/\b(qui[eé]n\s+(te|lo)\s+(creo|cre[oó]|hizo|invent[oó])|tu\s+(creador|amo|due[ñn]o))\b/.test(q)) {
    return "Mi creador, o mejor dicho mi amo, es Alexis Maza: estudiante de 16 años del CECyT 09 El Parral, Chiapas, grupo 2-C.";
  }
  if (/\b(qui[eé]n\s+eres|c[oó]mo\s+te\s+llamas|tu\s+nombre)\b/.test(q)) {
    return `Soy VEYMAR A.I., una inteligencia artificial inspirada en J.A.R.V.I.S., a su servicio${greet}.`;
  }

  // Ayuda / capacidades offline
  if (/\b(ayuda|qu[eé]\s+puedes\s+hacer|c[oó]mo\s+funcion|comandos)\b/.test(q)) {
    return [
      "Modo offline — puedo, sin internet:",
      "• Decirle la hora y la fecha exactas.",
      "• Responder saludos e identificarme.",
      "• Recordar respuestas previas guardadas en caché.",
      "• Calcular operaciones matemáticas básicas.",
      "Cuando recupere la conexión, vuelvo al núcleo completo automáticamente.",
    ].join("\n");
  }

  // Calculadora simple y segura: solo dígitos y operadores
  const mathMatch = q.match(/(?:cu[aá]nto\s+es\s+|calcula\s+|=\s*)?([0-9+\-*/().,\s]+)\??$/);
  if (mathMatch && /[0-9]/.test(mathMatch[1]) && /[+\-*/]/.test(mathMatch[1])) {
    try {
      const expr = mathMatch[1].replace(/,/g, ".");
      // eslint-disable-next-line no-new-func
      const val = Function(`"use strict"; return (${expr});`)();
      if (typeof val === "number" && Number.isFinite(val)) {
        return `${expr.trim()} = ${val}`;
      }
    } catch {}
  }

  // Caché de respuestas previas
  const cached = lookupCache(q);
  if (cached) return `(desde memoria local) ${cached}`;

  return null;
}

export function offlineFallbackMessage(): string {
  return "Modo offline activo. No tengo esa información guardada localmente. Pídame la hora, la fecha, un cálculo, o pregunte por algo que ya hayamos hablado antes.";
}
