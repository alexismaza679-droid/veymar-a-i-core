import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { LogOut, Trash2, Mic, MicOff, Volume2, VolumeX, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  useSpeechRecognition,
  speak,
  getVoiceOwner,
  setVoiceOwner,
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
          return fetch(url, { ...init, headers });
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

  const isWorking = status === "submitted" || status === "streaming";

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text?.trim();
    if (!text || isWorking) return;
    void sendMessage({ text });
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
                  <div className="w-full max-w-none px-1 text-foreground">
                    {m.parts.map((part, i) =>
                      part.type === "text" ? (
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      ) : null,
                    )}
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
          <PromptInputFooter className="justify-end px-2 pb-2">
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
