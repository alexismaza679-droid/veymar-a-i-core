import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const DEV_EMAIL = "alexis@maza.io";

async function requireDev(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  if ((data.user.email || "").toLowerCase() !== DEV_EMAIL) return null;
  return data.user;
}

export const Route = createFileRoute("/api/dev-action")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const user = await requireDev(request);
        if (!user) return new Response("Forbidden", { status: 403 });
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data } = await sb
          .from("app_config")
          .select("key,value,updated_at");
        return new Response(JSON.stringify({ config: data ?? [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        const user = await requireDev(request);
        if (!user) return new Response("Forbidden", { status: 403 });
        try {
          const { executeDevAction } = await import("@/lib/dev-actions.server");
          const body = (await request.json()) as { action?: unknown };
          const action = body?.action as any;
          if (!action || typeof action.type !== "string") {
            return new Response("Bad action", { status: 400 });
          }
          const result = await executeDevAction(action, user.id);
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(`error: ${e?.message || e}`, { status: 500 });
        }
      },
    },
  },
});
