import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEV_EMAIL = "alexis@maza.io";

export const Route = createFileRoute("/api/dev-stats")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7);
          const sb = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const { data: u, error: ue } = await sb.auth.getUser(token);
          if (ue || !u?.user) return new Response("Unauthorized", { status: 401 });
          if ((u.user.email || "").toLowerCase() !== DEV_EMAIL) {
            return new Response("Forbidden", { status: 403 });
          }

          // Total messages
          const { count: totalMessages } = await supabaseAdmin
            .from("messages")
            .select("*", { count: "exact", head: true });

          // Distinct users (sample last 1000)
          const { data: rows } = await supabaseAdmin
            .from("messages")
            .select("user_id, created_at")
            .order("created_at", { ascending: false })
            .limit(1000);
          const userSet = new Set<string>();
          const perDay = new Map<string, number>();
          (rows || []).forEach((r: any) => {
            userSet.add(r.user_id);
            const d = new Date(r.created_at).toISOString().slice(0, 10);
            perDay.set(d, (perDay.get(d) || 0) + 1);
          });
          const days = Array.from(perDay.entries())
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .slice(0, 7)
            .reverse();

          const secrets = {
            GROQ_API_KEY: !!process.env.GROQ_API_KEY,
            HF_TOKEN: !!process.env.HF_TOKEN,
            LOVABLE_API_KEY: !!process.env.LOVABLE_API_KEY,
            SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          };

          return new Response(
            JSON.stringify({
              totalMessages: totalMessages ?? 0,
              uniqueUsersSample: userSet.size,
              perDay: days,
              secrets,
              generatedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e: any) {
          return new Response(`error: ${e?.message || e}`, { status: 500 });
        }
      },
    },
  },
});
