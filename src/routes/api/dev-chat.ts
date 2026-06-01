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

          const groqKey = process.env.GROQ_API_KEY;
          if (!groqKey) return new Response("GROQ_API_KEY missing", { status: 500 });

          const body = (await request.json()) as {
            messages: { role: "user" | "assistant" | "system"; content: string }[];
          };

          const system = `Eres el "Núcleo Dev" de VEYMAR A.I.: un asesor técnico senior exclusivo de Alexis Maza (el creador).
Responde en español, con tono directo, técnico y conciso.
Sirves para:
- Diseñar y planificar actualizaciones del sistema VEYMAR.
- Sugerir mejoras de arquitectura, UX, prompts, herramientas y rendimiento.
- Generar fragmentos de código TypeScript/React/Tailwind listos para pegar en el proyecto (TanStack Start + Supabase + AI SDK).
- Diagnosticar bugs cuando Alexis te pegue logs o capturas.
Nunca expongas claves ni nada confidencial. Si Alexis te pide "aplica esto", devuélvele el bloque de código exacto y explícale brevemente dónde pegarlo.`;

          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0.4,
              messages: [{ role: "system", content: system }, ...(body.messages || []).slice(-20)],
            }),
          });
          if (!res.ok) {
            const txt = await res.text();
            return new Response(`Groq error: ${txt}`, { status: 502 });
          }
          const json: any = await res.json();
          const reply: string = json?.choices?.[0]?.message?.content ?? "(sin respuesta)";
          return new Response(JSON.stringify({ reply, model: json?.model }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(`error: ${e?.message || e}`, { status: 500 });
        }
      },
    },
  },
});
