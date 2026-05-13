import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { VeymarLogo } from "@/components/veymar-logo";
import { ImageActions, CopyTextButton } from "@/components/message-actions";
import { Button } from "@/components/ui/button";
import { LogOut, Trash2, Mic, MicOff, Volume2, VolumeX, UserCog, Ear, EarOff } from "lucide-react";
import { toast } from "sonner";
import {
  useSpeechRecognition,
  speak,
  getVoiceOwner,
  setVoiceOwner,
  extractWakeCommand,
} from "@/hooks/use-voice";

export const Route = createFileRoute("/_authed/chat")({
  component: ChatPage,
});

function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (url, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          headers.set("Content-Type", "application/json");
          let body = init?.body;
          try {
            const parsed = body ? JSON.parse(body as string) : {};
            parsed.ownerName = getVoiceOwner();
            body = JSON.stringify(parsed);
          } catch {}
          return fetch(url, { ...init, headers, body });
        },
      }),
    [],
  );

  // Load history once
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("content, created_at")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error(error);
        setInitialMessages([]);
        return;
      }
      const msgs = (data ?? [])
        .map((row) => row.content as unknown as UIMessage)
        .filter((m) => m && m.role && Array.isArray(m.parts));
      setInitialMessages(msgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (initialMessages === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <VeymarLogo className="h-20 w-20 animate-veymar-pulse" />
      </div>
    );
  }

  return <ChatInner initialMessages={initialMessages} transport={transport} onSignOut={async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }} />;
}

function ChatInner({
  initialMessages,
  transport,
  onSignOut,
}: {
  initialMessages: UIMessage[];
  transport: DefaultChatTransport<UIMessage>;
  onSignOut: () => void;
}) {
  const { messages, sendMessage, status, setMessages } = useChat({
    messages: initialMessages,
    transport,
    onError: (err) => {
      console.error(err);
      toast.error("VEYMAR ha encontrado una anomalía. Reintenta.");
    },
  });

  const [voiceOutput, setVoiceOutput] = useState(true);
  const [wakeMode, setWakeMode] = useState(false);
  const [owner, setOwner] = useState<string | null>(() => getVoiceOwner());
  const lastSpokenRef = useRef<string | null>(null);

  const isWorking = status === "submitted" || status === "streaming";

  const sendText = (text: string, fromVoice = false) => {
    if (!text || isWorking) return;
    const prefix =
      fromVoice && owner
        ? `[Entrada por voz · Identidad reconocida: ${owner}] `
        : fromVoice
          ? `[Entrada por voz · Identidad desconocida] `
          : "";
    void sendMessage({ text: prefix + text });
  };

  const { listening, interim, supported, start, stop } = useSpeechRecognition({
    onFinal: (text) => sendText(text, true),
  });

  // Always-on wake-word recognizer ("hey veymar ...")
  const wake = useSpeechRecognition({
    continuous: true,
    onFinal: (text) => {
      const cmd = extractWakeCommand(text);
      if (cmd === null) return;
      if (cmd === "") {
        speak(owner ? `Le escucho, ${owner}.` : "Le escucho.");
        return;
      }
      sendText(cmd, true);
    },
  });

  useEffect(() => {
    if (wakeMode && wake.supported && !wake.listening) wake.start();
    if (!wakeMode && wake.listening) wake.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeMode]);

  // Speak last assistant message when streaming finishes
  useEffect(() => {
    if (!voiceOutput) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
    if (!text || lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    speak(text);
  }, [status, messages, voiceOutput]);

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text?.trim();
    if (!text) return;
    sendText(text, false);
  };

  const configureOwner = () => {
    const current = getVoiceOwner() ?? "";
    const name = prompt(
      "¿Cómo debo llamarle cuando reconozca su voz? (Ej: Señor Stark)",
      current,
    );
    if (name && name.trim()) {
      setVoiceOwner(name.trim());
      setOwner(name.trim());
      toast.success(`Perfil de voz registrado: ${name.trim()}`);
    }
  };

  const wipe = async () => {
    if (!confirm("¿Borrar toda la memoria de VEYMAR?")) return;
    const { error } = await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast.error("No se pudo borrar la memoria.");
      return;
    }
    setMessages([]);
    toast.success("Memoria reiniciada.");
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="glass relative z-10 flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <VeymarLogo className="h-10 w-10" />
          <div>
            <div className="text-sm font-light tracking-[0.3em] text-glow">VEYMAR A.I.</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {isWorking ? "Procesando..." : "En línea · Núcleo activo"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={configureOwner}
            title={owner ? `Perfil de voz: ${owner}` : "Registrar perfil de voz"}
          >
            <UserCog className={`h-4 w-4 ${owner ? "text-primary" : ""}`} />
          </Button>
          {wake.supported && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setWakeMode((v) => !v)}
              title={wakeMode ? "Desactivar palabra clave 'Hey VEYMAR'" : "Activar palabra clave 'Hey VEYMAR'"}
            >
              {wakeMode ? (
                <Ear className="h-4 w-4 text-primary animate-pulse" />
              ) : (
                <EarOff className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setVoiceOutput((v) => !v)}
            title={voiceOutput ? "Silenciar voz" : "Activar voz"}
          >
            {voiceOutput ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={wipe} title="Reiniciar memoria">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onSignOut} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<VeymarLogo className="h-28 w-28 animate-veymar-pulse" />}
              title="A su servicio."
              description="Soy VEYMAR. Pregunte, ordene o delegue. Estoy preparado para asistir, programar, analizar y anticipar."
              className="min-h-[60vh]"
            />
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                {m.role === "assistant" ? (
                  <div className="w-full max-w-none px-1 text-foreground space-y-3">
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return <MessageResponse key={i}>{part.text}</MessageResponse>;
                      }
                      // Tool part rendering (AI SDK v5: type === `tool-${name}`)
                      const p: any = part;
                      if (p.type === "tool-generateImage") {
                        const out = p.output;
                        if (out?.ok && out?.imageUrl) {
                          return (
                            <figure key={i} className="rounded-xl overflow-hidden border border-border/40 panel-glow">
                              <img src={out.imageUrl} alt={out.prompt ?? "Imagen generada"} className="w-full h-auto block" />
                              {out.prompt && (
                                <figcaption className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-3 py-2 bg-background/40">
                                  {out.prompt}
                                </figcaption>
                              )}
                            </figure>
                          );
                        }
                        if (p.state === "input-streaming" || p.state === "input-available") {
                          return (
                            <div key={i} className="text-xs text-muted-foreground italic px-1">
                              Generando imagen…
                            </div>
                          );
                        }
                        if (out?.error) {
                          return (
                            <div key={i} className="text-xs text-destructive px-1">
                              No pude generar la imagen: {out.error}
                            </div>
                          );
                        }
                      }
                      if (p.type === "tool-getCurrentTime" && p.state === "input-streaming") {
                        return (
                          <div key={i} className="text-xs text-muted-foreground italic px-1">
                            Consultando reloj…
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ) : (
                  <MessageContent className="bg-primary text-primary-foreground">
                    {m.parts.map((part, i) =>
                      part.type === "text" ? <p key={i} className="whitespace-pre-wrap">{part.text}</p> : null,
                    )}
                  </MessageContent>
                )}
              </Message>
            ))
          )}

          {status === "submitted" && (
            <Message from="assistant">
              <div className="flex items-center gap-2 px-1">
                <Shimmer>VEYMAR está analizando…</Shimmer>
              </div>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
        <PromptInput onSubmit={handleSubmit} className="glass panel-glow rounded-2xl">
          <PromptInputTextarea
            placeholder="Hable con VEYMAR..."
            autoFocus
            className="min-h-[64px] bg-transparent text-base"
          />
          <PromptInputFooter className="justify-between px-2 pb-2">
            <div className="flex items-center gap-2">
              {supported ? (
                <Button
                  type="button"
                  variant={listening ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => (listening ? stop() : start())}
                  className={listening ? "animate-pulse bg-primary text-primary-foreground" : ""}
                  title={listening ? "Detener escucha" : "Hablar con VEYMAR"}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              ) : null}
              {interim ? (
                <span className="text-xs italic text-muted-foreground truncate max-w-[200px]">
                  «{interim}»
                </span>
              ) : null}
            </div>
            <PromptInputSubmit
              status={status}
              disabled={isWorking}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          VEYMAR A.I. · Asistencia inteligente de nueva generación
        </p>
      </div>
    </div>
  );
}
