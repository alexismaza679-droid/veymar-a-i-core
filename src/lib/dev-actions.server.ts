import { createClient } from "@supabase/supabase-js";
import { invalidateAppConfigCache } from "./app-config.server";

export type DevAction =
  | { type: "set_image_model"; model: string }
  | {
      type: "set_chat_model";
      mode: "fast" | "pro" | "think";
      modelId: string;
    }
  | { type: "set_default_mode"; mode: "fast" | "pro" | "expert" | "think" | "groq" }
  | { type: "set_free_mode"; enabled: boolean }
  | { type: "set_system_extra"; text: string }
  | {
      type: "set_tone";
      formality?: number;
      humor?: number;
      empathy?: number;
    }
  | { type: "reset"; keys?: string[] };

type Result = { ok: boolean; key?: string; value?: unknown; error?: string };

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function upsert(
  key: string,
  value: unknown,
  userId?: string | null,
): Promise<Result> {
  const sb = admin();
  const { error } = await sb
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: userId ?? null },
      { onConflict: "key" },
    );
  invalidateAppConfigCache();
  if (error) return { ok: false, error: error.message };
  return { ok: true, key, value };
}

export async function executeDevAction(
  action: DevAction,
  userId?: string | null,
): Promise<Result> {
  switch (action.type) {
    case "set_image_model":
      return upsert("image_model", action.model, userId);
    case "set_chat_model":
      return upsert(`chat_model_${action.mode}`, action.modelId, userId);
    case "set_default_mode":
      return upsert("default_mode", action.mode, userId);
    case "set_free_mode":
      return upsert("free_mode_default", !!action.enabled, userId);
    case "set_system_extra":
      return upsert("system_extra", action.text, userId);
    case "set_tone":
      return upsert(
        "tone",
        {
          formality: action.formality,
          humor: action.humor,
          empathy: action.empathy,
        },
        userId,
      );
    case "reset": {
      const sb = admin();
      const q = action.keys?.length
        ? sb.from("app_config").delete().in("key", action.keys)
        : sb.from("app_config").delete().neq("key", "");
      const { error } = await q;
      invalidateAppConfigCache();
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    default:
      return { ok: false, error: "Tipo de acción no soportado" };
  }
}

/** Extract ```action ... ``` JSON blocks from a markdown reply. */
export function extractActionBlocks(text: string): DevAction[] {
  const out: DevAction[] = [];
  const re = /```action\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const a of arr) {
        if (a && typeof a.type === "string") out.push(a as DevAction);
      }
    } catch {
      // ignore malformed block
    }
  }
  return out;
}
