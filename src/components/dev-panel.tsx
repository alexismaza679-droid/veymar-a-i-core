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
} from "lucide-react";
import { toast } from "sonner";
import { speakWith, stopSpeaking } from "@/hooks/use-voice";

const DEV_EMAIL = "alexis@maza.io";

type Msg = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
};

type Stats = {
  totalMessages: number;
  uniqueUsersSample: number;
  perDay: [string, number][];
  secrets: Record<string, boolean>;
  generatedAt: string;
};

function pollinationsScreenshot(reply: string): string {
  // Resumen muy corto para la "captura"
  const title = reply
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
  const [tab, setTab] = useState<"chat" | "stats">("chat");
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
      localStorage.setItem("veymar.dev_chat", JSON.stringify(messages.slice(-50)));
    } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && tab === "stats" && !stats) void loadStats();
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

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
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
      const json = (await res.json()) as { reply: string };
      const imageUrl = pollinationsScreenshot(json.reply);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: json.reply, imageUrl },
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
    // Voz distinta a VEYMAR (más aguda, más rápida, femenina)
    await speakWith(text, { rate: 1.15, pitch: 1.2 });
    // Limpia el estado cuando se asume terminado (estimación)
    const estMs = Math.min(60000, Math.max(2500, text.length * 55));
    setTimeout(() => setSpeakingIdx((cur) => (cur === idx ? null : cur)), estMs);
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

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) stopSpeaking(); }}>
        <SheetContent className="w-[380px] sm:w-[520px] flex flex-col p-0">
          <SheetHeader className="border-b border-border/40 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 tracking-[0.2em] text-glow">
              <Shield className="h-4 w-4 text-primary" /> NÚCLEO DEV
            </SheetTitle>
            <SheetDescription className="text-xs">
              Canal privado de Alexis Maza. Pídele a la IA cambios y los presenta como
              integraciones listas para pegar, con captura HUD y narración por voz.
            </SheetDescription>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-3 grid grid-cols-2">
              <TabsTrigger value="chat">
                <Hammer className="h-3.5 w-3.5 mr-1" /> Arquitecto
              </TabsTrigger>
              <TabsTrigger value="stats">
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Estadísticas
              </TabsTrigger>
            </TabsList>

            {/* CHAT TAB */}
            <TabsContent value="chat" className="flex-1 flex flex-col m-0 mt-2 outline-none">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-primary" /> Llama 3.3 70B · Groq
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3 text-primary" /> Captura HUD auto
                </span>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {messages.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">
                    Pide cosas como: <em>"Añade un panel de uso de tokens"</em> o{" "}
                    <em>"Mejora el prompt para que razone más rápido"</em>. La IA te
                    devolverá el resumen + código + una captura HUD generada.
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

              <div className="border-t border-border/40 p-3 space-y-2">
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
                  className="min-h-[80px] text-sm"
                />
                <div className="flex justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("¿Borrar este chat de desarrollo?")) setMessages([]);
                    }}
                  >
                    Limpiar
                  </Button>
                  <Button size="sm" onClick={send} disabled={loading || !input.trim()}>
                    <Send className="h-3.5 w-3.5 mr-1" /> Enviar
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* STATS TAB */}
            <TabsContent value="stats" className="flex-1 overflow-y-auto m-0 mt-2 px-4 py-3 space-y-4 outline-none">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-primary">
                  Telemetría VEYMAR
                </div>
                <Button size="sm" variant="ghost" onClick={loadStats} disabled={statsLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${statsLoading ? "animate-spin" : ""}`} />
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
                        <Users className="h-3 w-3" /> Usuarios (últ. 1000)
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
                      <div className="text-xs text-muted-foreground">Sin datos.</div>
                    )}
                    {(() => {
                      const max = Math.max(1, ...stats.perDay.map(([, n]) => n));
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
                      <div key={k} className="flex items-center justify-between text-xs">
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
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
