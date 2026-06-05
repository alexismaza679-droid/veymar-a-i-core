import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const DEV_EMAIL = "alexis@maza.io";

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

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

export const Route = createFileRoute("/api/versions")({
  server: {
    handlers: {
      GET: async () => {
        const sb = admin();
        const { data } = await sb
          .from("app_versions")
          .select("*")
          .order("created_at", { ascending: false });
        return new Response(JSON.stringify({ versions: data ?? [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }: { request: Request }) => {
        const user = await requireDev(request);
        if (!user) return new Response("Forbidden", { status: 403 });
        try {
          const body = (await request.json()) as any;
          const sb = admin();
          const payload = {
            version: String(body.version || "").trim(),
            name: String(body.name || "").trim(),
            status: String(body.status || "released"),
            released_at: body.released_at || null,
            summary: body.summary || null,
            features: Array.isArray(body.features) ? body.features : [],
            improvements: Array.isArray(body.improvements) ? body.improvements : [],
            fixes: Array.isArray(body.fixes) ? body.fixes : [],
            progress: Number.isFinite(body.progress) ? body.progress : 100,
            is_current: !!body.is_current,
            is_next: !!body.is_next,
            notes: body.notes || null,
            updated_at: new Date().toISOString(),
          };
          if (!payload.version || !payload.name) {
            return new Response("version y name son requeridos", { status: 400 });
          }
          if (payload.is_current) {
            await sb
              .from("app_versions")
              .update({ is_current: false })
              .neq("version", payload.version);
          }
          if (payload.is_next) {
            await sb
              .from("app_versions")
              .update({ is_next: false })
              .neq("version", payload.version);
          }
          const { data, error } = await sb
            .from("app_versions")
            .upsert(payload, { onConflict: "version" })
            .select()
            .single();
          if (error) return new Response(error.message, { status: 500 });
          const { invalidateVersionsCache } = await import("@/lib/versions.server");
          invalidateVersionsCache();
          return new Response(JSON.stringify({ ok: true, version: data }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(e?.message || String(e), { status: 500 });
        }
      },
      DELETE: async ({ request }: { request: Request }) => {
        const user = await requireDev(request);
        if (!user) return new Response("Forbidden", { status: 403 });
        const url = new URL(request.url);
        const version = url.searchParams.get("version");
        if (!version) return new Response("missing version", { status: 400 });
        const sb = admin();
        const { error } = await sb.from("app_versions").delete().eq("version", version);
        if (error) return new Response(error.message, { status: 500 });
        const { invalidateVersionsCache } = await import("@/lib/versions.server");
        invalidateVersionsCache();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
