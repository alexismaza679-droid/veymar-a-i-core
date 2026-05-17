import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, buildVeymarSystemPrompt } from "@/lib/ai-gateway";
import { createClient } from "@supabase/supabase-js";

type ChatBody = { messages?: UIMessage[]; ownerName?: string | null; mode?: "fast" | "pro" | "expert" | "think" };

async function enhanceImagePrompt(apiKey: string, userPrompt: string): Promise<string> {
  // Reescribe el prompt del usuario en una descripción visual rica en inglés,
  // siguiendo al pie de la letra lo pedido. Si falla, devuelve el original.
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "You rewrite user image requests into a single, vivid, literal English image-generation prompt. RULES: Preserve EVERY explicit detail (subject, count, colors, clothing, pose, setting, mood, style). Do NOT add unrequested people, text, or objects. Add tasteful technical detail (lighting, lens, composition, art style) ONLY if it doesn't change meaning. Output ONLY the prompt, no preface, no quotes, max 90 words.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return userPrompt;
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content?.trim?.() ?? "";
    return text || userPrompt;
  } catch {
    return userPrompt;
  }
}

async function generateImageViaGateway(
  apiKey: string,
  prompt: string,
  aspectRatio?: string,
): Promise<string> {
  const models = [
    "google/gemini-3.1-flash-image-preview", // Nano Banana 2 — más fiel al prompt
    "google/gemini-2.5-flash-image-preview", // Nano Banana — fallback estable
  ];
  const finalPrompt = aspectRatio
    ? `${prompt}\n\nAspect ratio: ${aspectRatio}. High quality, sharp focus, follow the description literally.`
    : `${prompt}\n\nHigh quality, sharp focus, follow the description literally.`;
  let lastErr = "";
  for (const model of models) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: finalPrompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        lastErr = `Image gateway ${model} ${res.status}`;
        continue;
      }
      const json: any = await res.json();
      const img =
        json?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
        json?.choices?.[0]?.message?.images?.[0]?.url;
      if (img) return img as string;
      lastErr = `Sin imagen en respuesta de ${model}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
  }
  throw new Error(lastErr || "No se pudo generar la imagen");
}

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

          const { messages = [], ownerName, mode = "pro" } = (await request.json()) as ChatBody;

          // Sanitiza historial: quita data URLs gigantes (imágenes generadas
          // y archivos adjuntos antiguos) y limita a los últimos 20 turnos.
          const trimmed = messages.slice(-20);
          const lastIdx = trimmed.length - 1;
          const sanitized = trimmed.map((m, idx) => {
            if (!Array.isArray((m as any).parts)) return m;
            const isLast = idx === lastIdx;
            const parts = (m as any).parts.map((p: any) => {
              if (p?.type === "tool-generateImage" && p?.output?.imageUrl) {
                return {
                  ...p,
                  output: {
                    ok: p.output.ok,
                    prompt: p.output.prompt,
                    imageUrl: "[imagen generada previamente]",
                  },
                };
              }
              // Mantén los archivos adjuntos sólo en el último mensaje del usuario.
              if (p?.type === "file" && !isLast) {
                return {
                  type: "text",
                  text: `[adjunto previo: ${p.filename ?? p.mediaType ?? "archivo"}]`,
                };
              }
              return p;
            });
            return { ...m, parts };
          });

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            await supabase.from("messages").insert({
              user_id: userId,
              role: "user",
              content: lastUser as unknown as Record<string, unknown>,
            });
          }

          const gateway = createLovableAiGatewayProvider(apiKey);
          // Modelo rápido, multimodal y eficiente en datos
          const model = gateway("google/gemini-3-flash-preview");

          const tools = {
            getCurrentTime: tool({
              description:
                "Obtiene la fecha y hora reales actuales. Úsala SIEMPRE que el usuario pregunte por la hora o la fecha.",
              inputSchema: z.object({
                timeZone: z
                  .string()
                  .optional()
                  .describe("IANA TZ (ej: 'America/Mexico_City'). Si no se conoce, omitir."),
              }),
              execute: async ({ timeZone }) => {
                const now = new Date();
                try {
                  const fmt = new Intl.DateTimeFormat("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: timeZone || "UTC",
                  });
                  return {
                    iso: now.toISOString(),
                    formatted: fmt.format(now),
                    timeZone: timeZone || "UTC",
                  };
                } catch {
                  return { iso: now.toISOString(), formatted: now.toUTCString(), timeZone: "UTC" };
                }
              },
            }),
            generateImage: tool({
              description:
                "Genera una imagen siguiendo AL PIE DE LA LETRA la descripción del usuario. Usa esta herramienta cuando pidan crear, dibujar, imaginar, generar o diseñar una imagen, foto, logo, escena, personaje, póster, etc. NO inventes elementos no pedidos. Si el usuario menciona aspecto/proporción (cuadrado, vertical, horizontal, 16:9, 9:16, etc.), pásalo en aspectRatio.",
              inputSchema: z.object({
                prompt: z
                  .string()
                  .describe(
                    "Descripción literal y específica de lo que el usuario pidió. Conserva sujetos, cantidades, colores, ropa, ambiente, estilo y detalles concretos. Puede estar en español o inglés.",
                  ),
                aspectRatio: z
                  .string()
                  .optional()
                  .describe("Proporción opcional: '1:1', '16:9', '9:16', '3:4', '4:3'. Si el usuario no la menciona, omitir."),
              }),
              execute: async ({ prompt, aspectRatio }) => {
                try {
                  const enhanced = await enhanceImagePrompt(apiKey, prompt);
                  const url = await generateImageViaGateway(apiKey, enhanced, aspectRatio);
                  return { ok: true, imageUrl: url, prompt: enhanced };
                } catch (e: any) {
                  return { ok: false, error: e?.message ?? "Error generando imagen" };
                }
              },
            }),
          };

          const system = buildVeymarSystemPrompt({ now: new Date(), ownerName, mode });

          const result = streamText({
            model,
            system,
            tools,
            stopWhen: stepCountIs(50),
            messages: await convertToModelMessages(sanitized),
            onError: ({ error }) => {
              console.error("[VEYMAR] streamText error", error);
            },
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            onError: (error: unknown) => {
              const msg = (error as any)?.message || String(error);
              const lower = msg.toLowerCase();
              if (lower.includes("payment") || lower.includes("not enough credits") || lower.includes("402")) {
                return "Sin créditos en el núcleo de IA. Añada créditos en Ajustes → Workspace → Uso para que pueda seguir respondiendo.";
              }
              if (lower.includes("429") || lower.includes("rate limit")) {
                return "Demasiadas solicitudes en este instante. Reintente en unos segundos.";
              }
              return "Anomalía temporal en el núcleo. Reintente en un momento.";
            },
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
        } catch (err: any) {
          console.error("[VEYMAR] chat error", err);
          const msg = err?.message || String(err);
          if (msg.toLowerCase().includes("payment") || msg.includes("402")) {
            return new Response("Sin créditos en el núcleo de IA. Añada créditos en Ajustes → Workspace → Uso.", { status: 402 });
          }
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
