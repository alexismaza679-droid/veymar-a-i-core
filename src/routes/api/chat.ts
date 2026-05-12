import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider, VEYMAR_SYSTEM_PROMPT } from "@/lib/ai-gateway";
import { createClient } from "@supabase/supabase-js";

type ChatBody = { messages?: UIMessage[] };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7);

          const supabaseUrl = process.env.SUPABASE_URL!;
          const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
          if (claimsError || !claims?.claims?.sub) {
            return new Response("Unauthorized", { status: 401 });
          }
          const userId = claims.claims.sub as string;

          const { messages = [] } = (await request.json()) as ChatBody;

          // Persist last user message
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            await supabase.from("messages").insert({
              user_id: userId,
              role: "user",
              content: lastUser as unknown as Record<string, unknown>,
            });
          }

          const gateway = createLovableAiGatewayProvider(apiKey);
          const model = gateway("google/gemini-3-flash-preview");

          const result = streamText({
            model,
            system: VEYMAR_SYSTEM_PROMPT,
            messages: convertToModelMessages(messages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onFinish: async ({ responseMessage }) => {
              try {
                await supabase.from("messages").insert({
                  user_id: userId,
                  role: "assistant",
                  content: responseMessage as unknown as Record<string, unknown>,
                });
              } catch (e) {
                console.error("[VEYMAR] persist assistant failed", e);
              }
            },
          });
        } catch (err) {
          console.error("[VEYMAR] chat error", err);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
