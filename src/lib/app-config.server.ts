import { createClient } from "@supabase/supabase-js";

export type AppConfig = {
  image_model?: string | null;
  chat_model_pro?: string | null;
  chat_model_fast?: string | null;
  chat_model_think?: string | null;
  default_mode?: "fast" | "pro" | "expert" | "think" | "groq" | null;
  free_mode_default?: boolean | null;
  system_extra?: string | null;
  tone?: { formality?: number; humor?: number; empathy?: number } | null;
};

let cache: { at: number; data: AppConfig } | null = null;
const TTL_MS = 5_000;

export async function loadAppConfig(): Promise<AppConfig> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.data;
  try {
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await admin.from("app_config").select("key,value");
    const out: AppConfig = {};
    for (const row of data ?? []) {
      (out as any)[row.key] = (row as any).value;
    }
    cache = { at: now, data: out };
    return out;
  } catch {
    return {};
  }
}

export function invalidateAppConfigCache() {
  cache = null;
}

export function buildToneSuffix(cfg: AppConfig): string {
  const parts: string[] = [];
  if (cfg.tone) {
    const { formality, humor, empathy } = cfg.tone;
    if (typeof formality === "number")
      parts.push(`Formalidad ${formality}/100.`);
    if (typeof humor === "number") parts.push(`Humor ${humor}/100.`);
    if (typeof empathy === "number") parts.push(`Empatía ${empathy}/100.`);
  }
  if (cfg.system_extra) parts.push(cfg.system_extra);
  return parts.length
    ? `\n\nAJUSTES EN VIVO (panel dev):\n- ${parts.join("\n- ")}`
    : "";
}
