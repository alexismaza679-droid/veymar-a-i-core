import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export const geocodeCity = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    const q = String(input?.query ?? "").trim().slice(0, 200);
    if (!q) throw new Error("Consulta vacía");
    return { query: q };
  })
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) {
      throw new Error("Conector Google Maps no configurado");
    }
    const res = await fetch(
      `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(data.query)}`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`Geocoder ${res.status}`);
    }
    const json: any = await res.json();
    const r = json.results?.[0];
    if (!r) throw new Error("Lugar no encontrado");
    return {
      label: r.formatted_address as string,
      lat: r.geometry.location.lat as number,
      lng: r.geometry.location.lng as number,
    };
  });
