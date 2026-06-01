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
import { Terminal, Send, Loader2, Cpu, Shield, Hammer } from "lucide-react";
import { toast } from "sonner";

const DEV_EMAIL = "alexis@maza.io";

type Msg = { role: "user" | "assistant"; content: string };

export function DevPanel() {
  const { user } = useAuth();
  const isDev = (user?.email || "").toLowerCase() === DEV_EMAIL;
  const [open, setOpen] = useState(false);
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("veymar.dev_chat", JSON.stringify(messages.slice(-50)));
    } catch {}
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!isDev) return null;

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
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
    } catch (e: any) {
      toast.error(`Dev chat: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante en la esquina inferior derecha */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-background/80 backdrop-blur shadow-lg hover:bg-primary/10 transition"
        title="Panel de Desarrollador (Alexis)"
      >
        <Terminal className="h-5 w-5 text-primary" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[380px] sm:w-[480px] flex flex-col p-0">
          <SheetHeader className="border-b border-border/40 px-4 py-3">
            <SheetTitle className="flex items-center gap-2 tracking-[0.2em] text-glow">
              <Shield className="h-4 w-4 text-primary" /> NÚCLEO DEV
            </SheetTitle>
            <SheetDescription className="text-xs">
              Canal privado de Alexis Maza. Pídele a la IA cambios, mejoras o
              fragmentos de código para integrar en VEYMAR.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3 w-3 text-primary" /> Llama 3.3 70B · Groq
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Hammer className="h-3 w-3 text-primary" /> Modo arquitecto
            </span>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm"
          >
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                Empieza pidiendo: <em>"Añade una capa de caché para las imágenes"</em> o{" "}
                <em>"Mejora el prompt de VEYMAR para razonar más"</em>.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[90%] rounded-lg bg-primary/15 px-3 py-2"
                    : "max-w-[95%] rounded-lg border border-border/40 bg-background/60 px-3 py-2"
                }
              >
                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
                  {m.content}
                </pre>
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
              placeholder="Escribe la actualización o pregunta… (Ctrl+Enter para enviar)"
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
        </SheetContent>
      </Sheet>
    </>
  );
}
