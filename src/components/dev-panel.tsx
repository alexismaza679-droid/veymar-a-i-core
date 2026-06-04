import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Terminal,
  Send,
  Loader2,
  Cpu,
  Shield,
  Hammer,
  Volume2,
  VolumeX,
  BarChart3,
  Users,
  KeyRound,
  ImageIcon,
  RefreshCw,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { speakWith, stopSpeaking } from "@/hooks/use-voice";

const DEV_EMAIL = "alexis@maza.io";

type Msg = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  executed?: { action: any; result: any }[];
};

type UserStat = {
  userId: string;
  email: string | null;
  total: number;
  userMsgs: number;
  assistantMsgs: number;
  first: string;
  last: string;
  spanHours: number;
  sampleTypes: Record<string, number>;
};

type Stats = {
  totalMessages: number;
  uniqueUsersSample: number;
  perDay: [string, number][];
  users: UserStat[];
  secrets: Record<string, boolean>;
  generatedAt: string;
};

const IDEAS: { title: string; prompt: string }[] = [
  {
    title: "⚡ Acción: Mejor generador de imágenes",
    prompt:
      "Cambia el generador de imágenes al mejor disponible, mejor que Nano Banana.",
  },
  {
    title: "⚡ Acción: Modo gratis siempre",
    prompt:
      "Activa el modo libre por defecto para que las imágenes usen Pollinations sin gastar créditos.",
  },
  {
    title: "⚡ Acción: Tono más cálido",
    prompt:
      "Ajusta el tono: formalidad 30, humor 70, empatía 90. Que VEYMAR sea más cálido y juguetón.",
  },
  {
    title: "Integración de calendario",
    prompt:
      "Añade integración con Google Calendar para programar eventos y recordatorios desde el chat. Detalla archivos, endpoint y UI.",
  },
  {
    title: "Base de conocimiento en vivo",
    prompt:
      "Conecta VEYMAR a búsqueda web en tiempo real (DuckDuckGo o Brave Search API). Devuelve fuentes citadas.",
  },
  {
    title: "Generación de texto avanzada",
    prompt:
      "Agrega modo Escritor Creativo (historias, poemas, guiones) con plantillas seleccionables.",
  },
  {
    title: "Aprendizaje continuo",
    prompt:
      "Guarda preferencias del usuario (tono, intereses, costumbres) en perfil persistente y reinyéctalas al system prompt.",
  },
  {
    title: "Voz avanzada",
    prompt:
      "Mejora la voz: detección de fin de frase real, barge-in, y selección automática de voz por idioma detectado.",
  },
  {
    title: "Conectividad multi-dispositivo",
    prompt:
      "Diseña un puente Home Assistant para controlar luces y altavoces desde VEYMAR.",
  },
  {
    title: "Seguridad reforzada",
    prompt:
      "Audita RLS y endpoints públicos. Propón cierres y rate-limit por IP en /api/*.",
  },
  {
    title: "Personalidad ajustable",
    prompt:
      "Añade sliders en Ajustes para formalidad, humor y empatía que modifiquen el system prompt en vivo.",
  },
  {
    title: "Caché + GPU móvil",
    prompt:
      "Implementa caché HTTP en /api/chat (stale-while-revalidate), service worker para assets y will-change/transform-gpu en animaciones clave.",
  },
];

function pollinationsScreenshot(reply: string): string {
  const title =
    reply
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#*_`>]/g, "")
      .split(/\n|\.|;/)
      .map((s) => s.trim())
      .filter(Boolean)[0]
      ?.slice(0, 90) || "VEYMAR update";
  const prompt = `Futuristic JARVIS-style HUD screenshot of VEYMAR A.I. dashboard showing: ${title}. Dark interface, cyan glow, holographic panels, code lines, neon accents, cinematic depth of field, 4k UI mockup`;
  const q = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1e7);
  return `https://image.pollinations.ai/prompt/${q}?width=768&height=512&seed=${seed}&nologo=true&enhance=true`;
}

export function DevPanel() {
  const { user } = useAuth();
  const isDev = (user?.email || "").toLowerCase() === DEV_EMAIL;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "stats" | "users" | "ideas">("chat");
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const raw = localStorage.getItem("veymar.dev_chat");
      return raw ? (JSON.parse(raw) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        "veymar.dev_chat",
        JSON.stringify(messages.slice(-50)),
      );
    } catch {}
    // Auto-scroll to bottom on new messages
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages, loading]);

  useEffect(() => {
    if (open && (tab === "stats" || tab === "users") && !stats) void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  if (!isDev) return null;

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/dev-stats", {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error(await res.text());
      setStats((await res.json()) as Stats);
    } catch (e: any) {
      toast.error(`Stats: ${e?.message || e}`);
    } finally {
      setStatsLoading(false);
    }
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    if (!overrideText) setInput("");
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/dev-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const json = (await res.json()) as {
        reply: string;
        executed?: { action: any; result: any }[];
      };
      const imageUrl = pollinationsScreenshot(json.reply);
      if (json.executed?.length) {
        const ok = json.executed.filter((e) => e.result?.ok).length;
        toast.success(`${ok}/${json.executed.length} acción(es) aplicadas en VEYMAR`);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply, imageUrl, executed: json.executed },
      ]);
    } catch (e: any) {
      toast.error(`Dev chat: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpeak = async (idx: number, text: string) => {
    if (speakingIdx === idx) {
      stopSpeaking();
      setSpeakingIdx(null);
      return;
    }
    stopSpeaking();
    setSpeakingIdx(idx);
    await speakWith(text, { rate: 1.15, pitch: 1.2 });
    const estMs = Math.min(60000, Math.max(2500, text.length * 55));
    setTimeout(
      () => setSpeakingIdx((cur) => (cur === idx ? null : cur)),
      estMs,
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-background/80 backdrop-blur shadow-lg hover:bg-primary/10 transition"
        title="Panel de Desarrollador (Alexis)"
      >
        <Terminal className="h-5 w-5 text-primary" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
      </button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) stopSpeaking();
        }}
      >
        <SheetContent className="w-[380px] sm:w-[560px] flex flex-col p-0 h-full max-h-screen overflow-hidden">
          <SheetHeader className="border-b border-border/40 px-4 py-3 shrink-0">
            <SheetTitle className="flex items-center gap-2 tracking-[0.2em] text-glow">
              <Shield className="h-4 w-4 text-primary" /> NÚCLEO DEV
            </SheetTitle>
            <SheetDescription className="text-xs">
              Canal privado de Alexis Maza.
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as any)}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="mx-4 mt-3 grid grid-cols-4 shrink-0">
              <TabsTrigger value="chat" className="text-[11px]">
                <Hammer className="h-3.5 w-3.5 mr-1" /> Arq.
              </TabsTrigger>
              <TabsTrigger value="ideas" className="text-[11px]">
                <Lightbulb className="h-3.5 w-3.5 mr-1" /> Ideas
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-[11px]">
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Stats
              </TabsTrigger>
              <TabsTrigger value="users" className="text-[11px]">
                <Users className="h-3.5 w-3.5 mr-1" /> Users
              </TabsTrigger>
            </TabsList>

            {/* CHAT TAB */}
            <TabsContent
              value="chat"
              className="flex-1 flex flex-col m-0 mt-2 min-h-0 outline-none data-[state=inactive]:hidden"
              forceMount
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground shrink-0">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-primary" /> Llama 3.3 70B · Groq
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3 text-primary" /> Captura HUD
                </span>
              </div>

              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 text-sm"
              >
                {messages.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">
                    Pide cosas como: <em>"Añade un panel de uso de tokens"</em>{" "}
                    o usa la pestaña <strong>Ideas</strong> para enviar
                    propuestas listas.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[90%] rounded-lg bg-primary/15 px-3 py-2"
                        : "max-w-[95%] rounded-lg border border-border/40 bg-background/60 px-3 py-2 space-y-2"
                    }
                  >
                    <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
                      {m.content}
                    </pre>
                    {m.role === "assistant" && (
                      <>
                        {m.executed && m.executed.length > 0 && (
                          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 space-y-1">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 inline-flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> Acciones ejecutadas en vivo
                            </div>
                            {m.executed.map((ex, j) => (
                              <div
                                key={j}
                                className="text-[11px] font-mono flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {ex.action?.type}
                                  {ex.action?.model
                                    ? ` → ${ex.action.model}`
                                    : ex.action?.modelId
                                      ? ` → ${ex.action.modelId}`
                                      : ex.action?.mode
                                        ? ` → ${ex.action.mode}`
                                        : ""}
                                </span>
                                <span
                                  className={
                                    ex.result?.ok
                                      ? "text-emerald-400"
                                      : "text-red-400"
                                  }
                                >
                                  {ex.result?.ok ? "● aplicado" : "✕ error"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {m.imageUrl && (
                          <div className="rounded-md border border-primary/30 overflow-hidden bg-black/40">
                            <img
                              src={m.imageUrl}
                              alt="Captura HUD generada"
                              loading="lazy"
                              className="w-full h-auto"
                            />
                            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              Captura simulada · Pollinations
                            </div>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <button
                            onClick={() => toggleSpeak(i, m.content)}
                            className="inline-flex items-center gap-1 rounded-md border border-border/40 px-2 py-1 text-[11px] hover:bg-primary/10"
                            title="Escuchar respuesta"
                          >
                            {speakingIdx === i ? (
                              <>
                                <VolumeX className="h-3 w-3" /> Detener
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" /> Escuchar
                              </>
                            )}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Procesando…
                  </div>
                )}
              </div>

              <div className="border-t border-border/40 p-3 space-y-2 shrink-0 bg-background">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Pídeme una mejora… (Ctrl+Enter para enviar)"
                  className="min-h-[70px] max-h-[160px] text-sm resize-none"
                />
                <div className="flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("¿Borrar este chat de desarrollo?"))
                        setMessages([]);
                    }}
                  >
                    Limpiar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void send()}
                    disabled={loading || !input.trim()}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* IDEAS TAB */}
            <TabsContent
              value="ideas"
              className="flex-1 min-h-0 overflow-y-auto m-0 mt-2 px-4 py-3 space-y-2 outline-none"
            >
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">
                Roadmap rápido
              </div>
              {IDEAS.map((it) => (
                <button
                  key={it.title}
                  onClick={() => {
                    setTab("chat");
                    void send(it.prompt);
                  }}
                  disabled={loading}
                  className="w-full text-left rounded-md border border-border/40 bg-background/60 px-3 py-2 hover:bg-primary/10 hover:border-primary/50 transition disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {it.title}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                    {it.prompt}
                  </div>
                </button>
              ))}
            </TabsContent>

            {/* STATS TAB */}
            <TabsContent
              value="stats"
              className="flex-1 min-h-0 overflow-y-auto m-0 mt-2 px-4 py-3 space-y-4 outline-none"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  Telemetría VEYMAR
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadStats}
                  disabled={statsLoading}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1 ${statsLoading ? "animate-spin" : ""}`}
                  />
                  Refrescar
                </Button>
              </div>

              {!stats && statsLoading && (
                <div className="text-xs text-muted-foreground">Cargando…</div>
              )}

              {stats && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/40 p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Mensajes totales
                      </div>
                      <div className="text-2xl font-mono text-primary">
                        {stats.totalMessages.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded-md border border-border/40 p-3">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> Usuarios (muestra)
                      </div>
                      <div className="text-2xl font-mono text-primary">
                        {stats.uniqueUsersSample}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/40 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Actividad por día (últ. 7)
                    </div>
                    {stats.perDay.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        Sin datos.
                      </div>
                    )}
                    {(() => {
                      const max = Math.max(
                        1,
                        ...stats.perDay.map(([, n]) => n),
                      );
                      return stats.perDay.map(([day, n]) => (
                        <div key={day} className="space-y-1">
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{day}</span>
                            <span>{n} msg</span>
                          </div>
                          <Progress value={(n / max) * 100} />
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="rounded-md border border-border/40 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground inline-flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> APIs vinculadas
                    </div>
                    {Object.entries(stats.secrets).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-mono">{k}</span>
                        <span
                          className={
                            v
                              ? "text-emerald-400 text-[10px] uppercase tracking-[0.2em]"
                              : "text-red-400 text-[10px] uppercase tracking-[0.2em]"
                          }
                        >
                          {v ? "● activa" : "○ ausente"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-muted-foreground text-right">
                    Generado: {new Date(stats.generatedAt).toLocaleString()}
                  </div>
                </>
              )}
            </TabsContent>

            {/* USERS TAB */}
            <TabsContent
              value="users"
              className="flex-1 min-h-0 overflow-y-auto m-0 mt-2 px-4 py-3 space-y-3 outline-none"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  Perfiles de usuario
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadStats}
                  disabled={statsLoading}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 mr-1 ${statsLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {!stats && statsLoading && (
                <div className="text-xs text-muted-foreground">Cargando…</div>
              )}

              {stats?.users?.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Aún no hay datos de usuarios.
                </div>
              )}

              {stats?.users?.map((us) => {
                const topType =
                  Object.entries(us.sampleTypes || {}).sort(
                    (a, b) => b[1] - a[1],
                  )[0]?.[0] || "—";
                return (
                  <div
                    key={us.userId}
                    className="rounded-md border border-border/40 p-3 space-y-2 bg-background/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium truncate">
                        {us.email || (
                          <span className="font-mono text-xs text-muted-foreground">
                            {us.userId.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-primary">
                        {us.total} msg
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          Usuario
                        </div>
                        <div className="font-mono">{us.userMsgs}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          IA
                        </div>
                        <div className="font-mono">{us.assistantMsgs}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          Span
                        </div>
                        <div className="font-mono">{us.spanHours}h</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Última: {new Date(us.last).toLocaleString()} · Tipo
                      dominante: <span className="text-primary">{topType}</span>
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
