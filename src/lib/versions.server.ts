import { createClient } from "@supabase/supabase-js";

export type AppVersion = {
  id: string;
  version: string;
  name: string;
  status: string;
  released_at: string | null;
  summary: string | null;
  features: string[];
  improvements: string[];
  fixes: string[];
  progress: number;
  is_current: boolean;
  is_next: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

let cache: { at: number; rows: AppVersion[] } | null = null;
const TTL_MS = 15_000;

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function loadVersions(): Promise<AppVersion[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  try {
    const sb = admin();
    const { data } = await sb
      .from("app_versions")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as unknown as AppVersion[];
    cache = { at: now, rows };
    return rows;
  } catch {
    return [];
  }
}

export function invalidateVersionsCache() {
  cache = null;
}

export function buildVersionsContext(rows: AppVersion[]): string {
  if (!rows.length) return "";
  const current = rows.find((r) => r.is_current);
  const next = rows.find((r) => r.is_next);
  const history = rows
    .filter((r) => !r.is_next)
    .slice(0, 6)
    .map((r) => `  • ${r.version} "${r.name}" — ${r.status}`)
    .join("\n");

  const fmtList = (label: string, arr: string[]) =>
    arr.length ? `${label}: ${arr.join("; ")}` : "";

  const parts: string[] = ["\n\nINFORMACIÓN OFICIAL DE VERSIÓN (consulta esto antes de responder sobre versiones, novedades, cambios o próximas actualizaciones):"];

  if (current) {
    parts.push(
      `- VERSIÓN ACTUAL: ${current.version} "${current.name}" (${current.status})` +
        (current.released_at ? `, lanzada ${new Date(current.released_at).toLocaleDateString("es-ES")}` : "") +
        (current.summary ? `. ${current.summary}` : ""),
    );
    const f = fmtList("  Nuevas funciones", current.features);
    const i = fmtList("  Mejoras", current.improvements);
    const x = fmtList("  Correcciones", current.fixes);
    if (f) parts.push(f);
    if (i) parts.push(i);
    if (x) parts.push(x);
  }
  if (next) {
    parts.push(
      `- PRÓXIMA VERSIÓN: ${next.version} "${next.name}" (${next.status}, progreso ${next.progress}%)` +
        (next.summary ? `. ${next.summary}` : ""),
    );
    const f = fmtList("  Funciones planeadas", next.features);
    if (f) parts.push(f);
  }
  if (history) parts.push(`- HISTORIAL:\n${history}`);

  parts.push(
    "Reglas: si el usuario pregunta '¿qué versión eres?', '¿qué hay de nuevo?', '¿qué cambió?' o '¿qué viene?', responde con estos datos exactos (no inventes versiones).",
  );
  return parts.join("\n");
}
