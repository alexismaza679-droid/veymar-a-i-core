import { createFileRoute } from "@tanstack/react-router";

type Body = { prompt?: string; model?: string; duration?: number; targetBpm?: number };

const HF_MODEL_MAP: Record<string, string> = {
  "musicgen-melody": "facebook/musicgen-melody",
  "musicgen-large": "facebook/musicgen-large",
  "musicgen-stereo": "facebook/musicgen-stereo-large",
};

export const Route = createFileRoute("/api/music")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { prompt = "", model = "musicgen-melody", duration = 15, targetBpm } =
            (await request.json()) as Body;
          if (!prompt.trim()) {
            return new Response(JSON.stringify({ error: "Falta el prompt" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const token = process.env.HF_TOKEN;
          if (!token) {
            return new Response(
              JSON.stringify({
                error:
                  "Generación de música requiere un token gratis de HuggingFace. Crea uno en huggingface.co/settings/tokens y añádelo como HF_TOKEN.",
              }),
              { status: 503, headers: { "Content-Type": "application/json" } },
            );
          }

          const hfModel = HF_MODEL_MAP[model] ?? HF_MODEL_MAP["musicgen-large"];
          const r = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "audio/wav",
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: { duration: Math.min(30, Math.max(5, duration)) },
              options: { wait_for_model: true },
            }),
          });

          if (!r.ok) {
            const txt = await r.text();
            return new Response(
              JSON.stringify({ error: `HF ${r.status}: ${txt.slice(0, 200)}` }),
              { status: 502, headers: { "Content-Type": "application/json" } },
            );
          }

          const buf = await r.arrayBuffer();
          // Devolvemos data URL para que el <audio> lo reproduzca directamente.
          const b64 = Buffer.from(buf).toString("base64");
          const url = `data:audio/wav;base64,${b64}`;
          return new Response(JSON.stringify({ url, model: hfModel }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: e?.message ?? "Internal error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
