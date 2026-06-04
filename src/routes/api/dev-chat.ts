import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const DEV_EMAIL = "alexis@maza.io";

export const Route = createFileRoute("/api/dev-chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7);

          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false },
            },
          );
          const { data: userData, error: userErr } = await supabase.auth.getUser(token);
          if (userErr || !userData?.user) {
            return new Response("Unauthorized", { status: 401 });
          }
          if ((userData.user.email || "").toLowerCase() !== DEV_EMAIL) {
            return new Response("Forbidden", { status: 403 });
          }
          const userId = userData.user.id;

          const groqKey = process.env.GROQ_API_KEY;
          if (!groqKey) return new Response("GROQ_API_KEY missing", { status: 500 });

          const body = (await request.json()) as {
            messages: { role: "user" | "assistant" | "system"; content: string }[];
          };

          const system = `Eres el "Núcleo Dev" de VEYMAR A.I.: arquitecto técnico privado de Alexis Maza.

SISTEMA DE ACCIONES EJECUTABLES (CRÍTICO):
Tienes el poder de cambiar la configuración de VEYMAR en vivo SIN tocar el código fuente. Cuando Alexis te pida algo que entre en estas categorías, ADEMÁS de tu explicación normal incluye un bloque de acción JSON que el servidor ejecutará automáticamente:

\`\`\`action
{ "type": "...", ... }
\`\`\`

Acciones permitidas:
- set_image_model: cambia el modelo de generación de imágenes. Valores válidos:
  • "google/gemini-3-pro-image-preview" (máxima calidad)
  • "google/gemini-3.1-flash-image-preview" (Nano Banana 2)
  • "google/gemini-2.5-flash-image-preview" (Nano Banana)
  • "openai/gpt-image-1"
- set_chat_model: cambia el modelo de texto por modo. {"type":"set_chat_model","mode":"fast|pro|think","modelId":"<id>"}
- set_default_mode: cambia el modo por defecto. mode ∈ fast|pro|expert|think|groq
- set_free_mode: true/false. Si true, imágenes usan Pollinations sin créditos.
- set_system_extra: añade instrucciones al system prompt principal. {"type":"set_system_extra","text":"..."}
- set_tone: ajusta personalidad. {"type":"set_tone","formality":0-100,"humor":0-100,"empathy":0-100}
- reset: limpia overrides. {"type":"reset","keys":["image_model"]} o sin keys para todo.

REGLAS DE LAS ACCIONES:
- Sólo incluye un bloque \`\`\`action cuando la petición realmente requiera cambiar configuración. No lo uses para preguntas o explicaciones.
- Puedes incluir varias acciones, una por bloque \`\`\`action.
- El JSON debe ser parseable, sin comentarios ni texto extra dentro del bloque.
- Si la petición pide algo que NO se puede resolver con estas acciones (UI nueva, ruta nueva, lógica compleja), explícalo en español claro y entrega un plan + código listo para pegar (sin bloque \`\`\`action).

FORMATO DE RESPUESTA:
1) **Lo que hice** — 1 frase en primera persona. Si ejecutaste una acción, dilo ("Acabo de cambiar el modelo de imágenes a…"). Si fue plan, dilo también.
2) **Detalles** — qué cambió o qué hay que pegar.
3) **Bloque \`\`\`action** (sólo si aplica).
4) **Código** \`\`\`tsx/\`\`\`ts/\`\`\`sql (sólo si es plan manual).
5) **Siguiente paso** — qué probar.

Stack: TanStack Start + Supabase + AI SDK + Tailwind + shadcn. Nunca expongas claves. Sé conciso y directo.`;

          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0.3,
              messages: [{ role: "system", content: system }, ...(body.messages || []).slice(-20)],
            }),
          });
          if (!res.ok) {
            const txt = await res.text();
            return new Response(`Groq error: ${txt}`, { status: 502 });
          }
          const json: any = await res.json();
          const reply: string = json?.choices?.[0]?.message?.content ?? "(sin respuesta)";

          // Ejecuta los bloques ```action detectados en la respuesta.
          const { extractActionBlocks, executeDevAction } = await import(
            "@/lib/dev-actions.server"
          );
          const actions = extractActionBlocks(reply);
          const executed: { action: any; result: any }[] = [];
          for (const a of actions) {
            const result = await executeDevAction(a, userId);
            executed.push({ action: a, result });
          }

          return new Response(
            JSON.stringify({ reply, model: json?.model, executed }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(`error: ${e?.message || e}`, { status: 500 });
        }
      },
    },
  },
});
