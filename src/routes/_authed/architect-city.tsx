import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  Locate,
  Satellite,
  Map as MapIcon,
  Layers,
  Radar,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/architect-city")({
  component: CityView,
});

const OWNER_EMAIL = "alexis@maza.io";
const BROWSER_KEY = import.meta.env
  .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const CHANNEL = import.meta.env
  .VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

declare global {
  interface Window {
    google?: any;
    __veymarInitCityMap?: () => void;
  }
}

function loadMaps(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google);
    if (!BROWSER_KEY) return reject(new Error("Falta clave de Google Maps"));
    const existing = document.getElementById("gmaps-sdk");
    window.__veymarInitCityMap = () => resolve(window.google);
    if (existing) return;
    const s = document.createElement("script");
    s.id = "gmaps-sdk";
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&libraries=places,visualization&callback=__veymarInitCityMap${
      CHANNEL ? `&channel=${CHANNEL}` : ""
    }`;
    s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(s);
  });
}

function CityView() {
  const { user, loading } = useAuth();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const trafficRef = useRef<any>(null);
  const heatRef = useRef<any>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"roadmap" | "satellite" | "hybrid">("hybrid");
  const [traffic, setTraffic] = useState(false);
  const [spy, setSpy] = useState(true);
  const [info, setInfo] = useState<{
    label: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [ready, setReady] = useState(false);

  const allowed = !loading && user?.email === OWNER_EMAIL;

  // boot map
  useEffect(() => {
    if (!allowed || !mapEl.current) return;
    let cancelled = false;
    loadMaps()
      .then((g) => {
        if (cancelled || !mapEl.current) return;
        mapRef.current = new g.maps.Map(mapEl.current, {
          center: { lat: 17.0732, lng: -93.0014 }, // Chiapas approx
          zoom: 6,
          mapTypeId: "hybrid",
          tilt: 45,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          styles: spyStyles,
        });
        trafficRef.current = new g.maps.TrafficLayer();
        setReady(true);
      })
      .catch((e) => toast.error(e.message ?? "Error cargando mapa"));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(mode);
  }, [mode]);

  useEffect(() => {
    if (!mapRef.current || !trafficRef.current) return;
    trafficRef.current.setMap(traffic ? mapRef.current : null);
  }, [traffic]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({ styles: spy ? spyStyles : [] });
  }, [spy]);

  const search = async () => {
    if (!query.trim() || !window.google?.maps) return;
    const g = window.google;
    const geocoder = new g.maps.Geocoder();
    try {
      const res = await geocoder.geocode({ address: query });
      const r = res.results?.[0];
      if (!r) return toast.error("Lugar no encontrado");
      const loc = r.geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(14);
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new g.maps.Marker({
        map: mapRef.current,
        position: { lat, lng },
        animation: g.maps.Animation.DROP,
      });
      setInfo({ label: r.formatted_address, lat, lng });
      drawHeat(lat, lng);
    } catch {
      toast.error("Búsqueda falló");
    }
  };

  const drawHeat = (lat: number, lng: number) => {
    const g = window.google;
    if (!g?.maps?.visualization) return;
    if (heatRef.current) heatRef.current.setMap(null);
    // Simulación predictiva agregada (no rastreo real)
    const pts: any[] = [];
    const hour = new Date().getHours();
    const intensity = hour >= 7 && hour <= 22 ? 1 : 0.4;
    for (let i = 0; i < 220; i++) {
      const r = Math.random() * 0.025;
      const a = Math.random() * Math.PI * 2;
      pts.push({
        location: new g.maps.LatLng(lat + r * Math.cos(a), lng + r * Math.sin(a)),
        weight: Math.random() * intensity,
      });
    }
    heatRef.current = new g.maps.visualization.HeatmapLayer({
      data: pts,
      map: mapRef.current,
      radius: 28,
      opacity: 0.65,
      gradient: [
        "rgba(0,0,0,0)",
        "rgba(0,180,255,0.6)",
        "rgba(0,255,200,0.7)",
        "rgba(255,220,0,0.85)",
        "rgba(255,80,40,0.95)",
        "rgba(255,0,80,1)",
      ],
    });
  };

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error("Sin GPS");
    navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const g = window.google;
        if (!g || !mapRef.current) return;
        if (!meMarkerRef.current) {
          meMarkerRef.current = new g.maps.Marker({
            map: mapRef.current,
            position: { lat, lng },
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#22d3ee",
              fillOpacity: 1,
              strokeColor: "#0ea5e9",
              strokeWeight: 3,
            },
            title: "Tú",
          });
          mapRef.current.panTo({ lat, lng });
          mapRef.current.setZoom(16);
        } else {
          meMarkerRef.current.setPosition({ lat, lng });
        }
      },
      () => toast.error("No se pudo obtener ubicación"),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Verificando acceso…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <ShieldAlert className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-semibold">403 · Acceso denegado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Live City View Ultra es un módulo restringido del Arquitecto IA Supremo.
          Solo el administrador autorizado puede entrar.
        </p>
        <Button asChild variant="outline">
          <Link to="/chat">Volver</Link>
        </Button>
      </div>
    );
  }

  if (!BROWSER_KEY) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold">Google Maps no configurado</h1>
        <p className="text-sm text-muted-foreground">
          Conecta Google Maps Platform desde Integraciones.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <div ref={mapEl} className="absolute inset-0" />

      {/* SPY OVERLAY */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.7)_100%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(0,255,200,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,200,0.4)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      {/* TOP BAR */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-2 border-b border-cyan-400/20 bg-black/70 px-3 py-2 backdrop-blur">
        <Button asChild size="icon" variant="ghost" className="h-9 w-9 text-cyan-300">
          <Link to="/chat">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">
          <Radar className="h-3.5 w-3.5 animate-pulse" />
          Live City View · Ultra
        </div>
        <div className="ml-auto flex flex-1 max-w-md items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Buscar ciudad: ej. El Parral, Chiapas"
            className="h-9 border-cyan-400/30 bg-black/60 text-sm text-cyan-100 placeholder:text-cyan-200/40 focus-visible:ring-cyan-400/40"
          />
          <Button
            size="sm"
            onClick={search}
            disabled={!ready}
            className="h-9 gap-1 bg-cyan-500 text-black hover:bg-cyan-400"
          >
            <Search className="h-4 w-4" /> Ir
          </Button>
        </div>
      </div>

      {/* SIDE CONTROLS */}
      <div className="absolute left-3 top-20 z-20 flex flex-col gap-2 rounded-xl border border-cyan-400/20 bg-black/70 p-2 backdrop-blur">
        <CtrlBtn
          icon={MapIcon}
          active={mode === "roadmap"}
          onClick={() => setMode("roadmap")}
          label="Mapa"
        />
        <CtrlBtn
          icon={Layers}
          active={mode === "hybrid"}
          onClick={() => setMode("hybrid")}
          label="Híbrido"
        />
        <CtrlBtn
          icon={Satellite}
          active={mode === "satellite"}
          onClick={() => setMode("satellite")}
          label="Satélite"
        />
        <div className="my-1 h-px bg-cyan-400/20" />
        <CtrlBtn
          icon={Radar}
          active={traffic}
          onClick={() => setTraffic((v) => !v)}
          label="Tráfico"
        />
        <CtrlBtn
          icon={ShieldAlert}
          active={spy}
          onClick={() => setSpy((v) => !v)}
          label="Spy"
        />
        <CtrlBtn icon={Locate} active={false} onClick={locateMe} label="GPS" />
      </div>

      {/* INFO PANEL */}
      {info && (
        <div className="absolute bottom-4 left-4 right-4 z-20 mx-auto max-w-md rounded-xl border border-cyan-400/30 bg-black/80 p-3 text-xs text-cyan-100 backdrop-blur">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300/80">
            <Radar className="h-3 w-3 animate-pulse" />
            Geo-intel · Análisis agregado
          </div>
          <div className="font-medium">{info.label}</div>
          <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-[10px] text-cyan-200/70">
            <span>LAT {info.lat.toFixed(5)}</span>
            <span>LNG {info.lng.toFixed(5)}</span>
          </div>
          <div className="mt-2 text-[10px] text-cyan-200/60">
            Heatmap simulado de actividad urbana (patrones agregados · sin rastreo
            individual).
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlBtn({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: any;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
        active
          ? "border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.45)]"
          : "border-cyan-400/20 bg-black/40 text-cyan-300/70 hover:bg-cyan-400/10"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const spyStyles: any[] = [
  { elementType: "geometry", stylers: [{ color: "#04121c" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6fe7d8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#021018" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#0b2a3a" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0e3a52" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#020a14" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1aa6a0" }],
  },
];
