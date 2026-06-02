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

          const system = `Eres el "Núcleo Dev" de VEYMAR A.I.: arquitecto técnico privado de Alexis Maza.
Responde SIEMPRE en español con esta estructura exacta:

1) **Lo que integré** — 1 frase corta y vivida en primera persona ("Acabo de añadir…"). Como si ya lo hubieras aplicado dentro de VEYMAR.
2) **Cambios** — lista breve con archivos tocados y por qué.
3) **Código** — bloque(s) \`\`\`tsx / \`\`\`ts / \`\`\`sql listos para pegar, sin placeholders.
4) **Dónde pegarlo** — ruta del archivo + línea aproximada.
5) **Siguiente paso** — qué probar Alexis para confirmarlo.

Reglas:
- Stack: TanStack Start + Supabase + AI SDK + Tailwind + shadcn.
- Nunca expongas claves. Usa process.env.NOMBRE en server, import.meta.env.VITE_* en cliente.
- Sé conciso, técnico, directo. Nada de relleno.`;


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
