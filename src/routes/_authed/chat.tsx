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
import { SpeakingWaves } from "@/components/speaking-waves";
import { Button } from "@/components/ui/button";
import { LogOut, Trash2, Mic, MicOff, Volume2, VolumeX, UserCog, Ear, EarOff, WifiOff, Wifi, Paperclip, X, FileText, Music, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  useSpeechRecognition,
  speak,
  getVoiceOwner,
  setVoiceOwner,
  extractWakeCommand,
} from "@/hooks/use-voice";
import { offlineRespond, offlineFallbackMessage, rememberAnswer } from "@/lib/offline-brain";
import type { FileUIPart } from "ai";

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
  const [offlineMode, setOfflineMode] = useState(false);
  const [owner, setOwner] = useState<string | null>(() => getVoiceOwner());
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  const isWorking = status === "submitted" || status === "streaming";

  const pushLocalAssistant = (text: string) => {
    const id = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id, role: "assistant", parts: [{ type: "text", text }] } as UIMessage,
    ]);
    if (voiceOutput) speak(text);
  };

  const sendText = (text: string, fromVoice = false) => {
    if ((!text && attachments.length === 0) || isWorking) return;
    // Modo offline: responde localmente sin tocar la red.
    if (offlineMode) {
      const userId = `local-u-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", parts: [{ type: "text", text }] } as UIMessage,
      ]);
      const reply = offlineRespond(text, owner) ?? offlineFallbackMessage();
      setTimeout(() => pushLocalAssistant(reply), 200);
      return;
    }
    const prefix =
      fromVoice && owner
        ? `[Entrada por voz · Identidad reconocida: ${owner}] `
        : fromVoice
          ? `[Entrada por voz · Identidad desconocida] `
          : "";
    const files = attachments.length > 0 ? attachments : undefined;
    void sendMessage({ text: prefix + text, files });
    setAttachments([]);
    // Cachea la pregunta para futuras respuestas offline
    if (text) rememberAnswer(text, "");
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const onPickFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next: FileUIPart[] = [];
    for (const file of Array.from(list)) {
      if (file.size > 18 * 1024 * 1024) {
        toast.error(`${file.name} supera 18 MB.`);
        continue;
      }
      try {
        const url = await fileToDataUrl(file);
        next.push({
          type: "file",
          mediaType: file.type || "application/octet-stream",
          filename: file.name,
          url,
        });
      } catch {
        toast.error(`No pude leer ${file.name}`);
      }
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
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

  // Speak last assistant message when streaming finishes + cache for offline use
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
    if (!text || lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    // Cachea pregunta→respuesta para modo offline
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.parts
      .map((p: any) => (p.type === "text" ? p.text : ""))
      .join(" ")
      .replace(/\[Entrada por voz[^\]]*\]\s*/g, "")
      .trim();
    if (userText) rememberAnswer(userText, text);
    if (voiceOutput) speak(text);
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
    <div className="relative flex h-screen flex-col overflow-hidden">
      {/* Fondo animado: logo VEYMAR flotando + ondas al hablar */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <VeymarLogo
          className="h-[70vmin] w-[70vmin] opacity-[0.06] animate-veymar-float"
          animated
        />
      </div>
      <SpeakingWaves />
      <header className="glass relative z-10 flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <VeymarLogo className="h-10 w-10" />
          <div>
            <div className="text-sm font-light tracking-[0.3em] text-glow">VEYMAR A.I.</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {offlineMode
                ? "Modo offline · Núcleo local"
                : isWorking
                  ? "Procesando..."
                  : "En línea · Núcleo activo"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setOfflineMode((v) => !v);
              toast.success(!offlineMode ? "Modo offline activado." : "Modo en línea restablecido.");
            }}
            title={offlineMode ? "Desactivar modo offline" : "Activar modo offline (sin internet)"}
          >
            {offlineMode ? (
              <WifiOff className="h-4 w-4 text-amber-400" />
            ) : (
              <Wifi className="h-4 w-4 text-primary" />
            )}
          </Button>
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

      <Conversation className="relative z-10 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="space-y-6 py-8">
              <ConversationEmptyState
                icon={<VeymarLogo className="h-28 w-28 animate-veymar-pulse" />}
                title="A su servicio."
                description="Soy VEYMAR. Pregunte, ordene o delegue. Estoy preparado para asistir, programar, analizar y anticipar."
                className="min-h-[30vh]"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="glass panel-glow rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Núcleo multi-agente</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Analista — interpreta intención</li>
                    <li>• Estratega — elige enfoque y herramientas</li>
                    <li>• Investigador — reúne hechos</li>
                    <li>• Redactor — responde como VEYMAR</li>
                  </ul>
                </div>
                <div className="glass panel-glow rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Comandos por voz</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• "Hey VEYMAR, ¿qué hora es?"</li>
                    <li>• "Hey VEYMAR, resume qué es la biología"</li>
                    <li>• "Hey VEYMAR, genera una imagen de…"</li>
                    <li>• Activa el modo escucha con el ícono <Ear className="inline h-3 w-3" /></li>
                  </ul>
                </div>
                <div className="glass panel-glow rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Memoria persistente</div>
                  <p className="text-xs text-muted-foreground">
                    Recuerdo toda nuestra conversación entre sesiones. Use el ícono <Trash2 className="inline h-3 w-3" /> para reiniciar mi memoria, o <UserCog className="inline h-3 w-3" /> para registrar su perfil de voz.
                  </p>
                </div>
                <div className="glass panel-glow rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-primary mb-2">Capacidades activas</div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Reloj y fecha en tiempo real</li>
                    <li>• Generación de imágenes (Nano Banana 2)</li>
                    <li>• Voz masculina, fluida y natural</li>
                    <li>• Modelo optimizado: rápido y bajo en datos</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                {m.role === "assistant" ? (
                  <div className="w-full max-w-none px-1 text-foreground space-y-3">
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <div key={i} className="space-y-1">
                            <MessageResponse>{part.text}</MessageResponse>
                            {part.text?.trim() && (
                              <div className="flex justify-start pt-1">
                                <CopyTextButton text={part.text} />
                              </div>
                            )}
                          </div>
                        );
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
                              <ImageActions url={out.imageUrl} prompt={out.prompt} />
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

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
        <PromptInput onSubmit={handleSubmit} className="glass panel-glow rounded-2xl">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((a, idx) => {
                const isImg = a.mediaType.startsWith("image/");
                const isAudio = a.mediaType.startsWith("audio/");
                const Icon = isImg ? ImageIcon : isAudio ? Music : FileText;
                return (
                  <div
                    key={idx}
                    className="group relative flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-2 py-1 text-xs"
                  >
                    {isImg ? (
                      <img src={a.url} alt={a.filename} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <Icon className="h-4 w-4 text-primary" />
                    )}
                    <span className="max-w-[140px] truncate">{a.filename}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((p) => p.filter((_, i) => i !== idx))}
                      className="rounded p-0.5 hover:bg-destructive/20"
                      title="Quitar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,audio/*"
                className="hidden"
                onChange={(e) => {
                  void onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar imagen, PDF o audio"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
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
          VEYMAR A.I. · Asistencia inteligente de nueva generación · Adjunta imágenes, PDF o audio
        </p>
      </div>
    </div>
  );
}
