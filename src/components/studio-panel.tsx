import { useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Wand2, Music2, Upload, ExternalLink, Sparkles, Gamepad2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { analyzeAudioFile, type AudioAnalysis } from "@/lib/audio-analysis";

const MUSIC_MODELS = [
  { id: "musicgen-melody", label: "MusicGen Melody", note: "Acepta audio de referencia (melodía/ritmo)" },
  { id: "musicgen-large", label: "MusicGen Large", note: "Mayor fidelidad, sin audio de referencia" },
  { id: "musicgen-stereo", label: "MusicGen Stereo", note: "Estéreo, más espacial" },
];

export function StudioPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="VEYMAR Studio · Música & Mundos">
          <Wand2 className="h-4 w-4 text-primary" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[360px] sm:w-[460px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="tracking-[0.2em] text-glow">VEYMAR STUDIO</SheetTitle>
          <SheetDescription>
            Laboratorio creativo: música multi-modelo y mundos interactivos.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="music" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="music" className="gap-1 text-xs">
              <Music2 className="h-3.5 w-3.5" /> Música
            </TabsTrigger>
            <TabsTrigger value="genie" className="gap-1 text-xs">
              <Gamepad2 className="h-3.5 w-3.5" /> Genie 2
            </TabsTrigger>
          </TabsList>
          <TabsContent value="music" className="mt-4">
            <MusicStudio />
          </TabsContent>
          <TabsContent value="genie" className="mt-4">
            <GeniePanel />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function MusicStudio() {
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [duration, setDuration] = useState(15);
  const [models, setModels] = useState<string[]>(["musicgen-melody", "musicgen-large"]);
  const [reference, setReference] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tracks, setTracks] = useState<{ model: string; url: string | null; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleModel = (id: string) => {
    setModels((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  };

  const onPickReference = async (file: File | null) => {
    setReference(file);
    setAnalysis(null);
    if (!file) return;
    setAnalyzing(true);
    try {
      const a = await analyzeAudioFile(file);
      setAnalysis(a);
      toast.success(`Análisis listo · ${a.bpm} BPM · ${a.key}`);
    } catch (e: any) {
      toast.error("No pude analizar el audio: " + (e?.message ?? "error"));
    } finally {
      setAnalyzing(false);
    }
  };

  const onGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe el estilo musical que quieres.");
      return;
    }
    if (models.length === 0) {
      toast.error("Elige al menos un modelo.");
      return;
    }
    setGenerating(true);
    setTracks(models.map((m) => ({ model: m, url: null })));

    // Construimos un prompt enriquecido con BPM/tonalidad si hay referencia.
    const enriched = analysis
      ? `${prompt}. Tempo ${analysis.bpm} BPM, tonalidad ${analysis.key}.${lyrics ? ` Letra: ${lyrics.slice(0, 200)}` : ""}`
      : `${prompt}${lyrics ? `. Letra: ${lyrics.slice(0, 200)}` : ""}`;

    // Disparamos en paralelo. El backend intentará varios proveedores gratuitos.
    await Promise.all(
      models.map(async (model) => {
        try {
          const res = await fetch("/api/music", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: enriched, model, duration }),
          });
          if (!res.ok) {
            const txt = await res.text();
            setTracks((t) =>
              t.map((x) => (x.model === model ? { ...x, error: txt || `HTTP ${res.status}` } : x)),
            );
            return;
          }
          const json = (await res.json()) as { url?: string; error?: string };
          setTracks((t) =>
            t.map((x) =>
              x.model === model
                ? { ...x, url: json.url ?? null, error: json.error }
                : x,
            ),
          );
        } catch (e: any) {
          setTracks((t) =>
            t.map((x) => (x.model === model ? { ...x, error: e?.message ?? "error" } : x)),
          );
        }
      }),
    );
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200/90">
        Modo gratis: usamos endpoints públicos de MusicGen (Meta). Pueden ir lentos o caer.
        Si quieres calidad estable, añade un <strong>HF_TOKEN</strong> (gratis en huggingface.co).
      </div>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Estilo / prompt</Label>
        <Textarea
          rows={3}
          placeholder="Ej: synthwave épico, drums potentes, bajo grueso, atmósfera cinemática nocturna"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Letra (opcional)</Label>
        <Textarea
          rows={3}
          placeholder="MusicGen no canta letras reales, pero la usamos como guía emocional. Para voces reales, conecta luego un TTS."
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
        />
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">
          Audio de referencia (melodía / ritmo)
        </Label>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => onPickReference(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-2" />
          {reference ? reference.name : "Subir audio (mp3, wav…)"}
        </Button>
        {analyzing && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Analizando BPM y tonalidad…
          </div>
        )}
        {analysis && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px]">
            <div><strong>{analysis.bpm}</strong> BPM · tonalidad <strong>{analysis.key}</strong></div>
            <div className="text-muted-foreground">
              Se inyectará en el prompt. MusicGen-Melody además usará el audio como guía.
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">
          Duración: {duration}s
        </Label>
        <Slider
          value={[duration]}
          min={5}
          max={30}
          step={1}
          onValueChange={(v) => setDuration(v[0])}
        />
      </section>

      <section className="space-y-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Modelos en paralelo</Label>
        <div className="space-y-1">
          {MUSIC_MODELS.map((m) => {
            const active = models.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleModel(m.id)}
                className={`w-full text-left rounded-md border p-2 text-xs transition ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border/40 bg-background/40 hover:bg-background/70"
                }`}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-[10px] text-muted-foreground">{m.note}</div>
              </button>
            );
          })}
        </div>
      </section>

      <Button className="w-full" onClick={onGenerate} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Generando…
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5 mr-2" /> Generar en paralelo
          </>
        )}
      </Button>

      {tracks.length > 0 && (
        <section className="space-y-2 pt-2">
          <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Resultados</Label>
          {tracks.map((t) => (
            <div key={t.model} className="rounded-md border border-border/40 p-2">
              <div className="text-xs font-medium mb-1">{t.model}</div>
              {t.url ? (
                <audio src={t.url} controls className="w-full" />
              ) : t.error ? (
                <div className="text-[11px] text-destructive">Error: {t.error}</div>
              ) : (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Esperando…
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function GeniePanel() {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 text-primary" />
          <strong>Google DeepMind · Genie 2</strong>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Genie 2 genera <em>mundos 3D jugables</em> a partir de una sola imagen.
          Es <strong>investigación interna de DeepMind</strong>: hoy no tiene API pública,
          ni SDK, ni endpoint gratuito. No es algo que se pueda integrar técnicamente todavía.
        </p>
        <a
          href="https://deepmind.google/discover/blog/genie-2-a-large-scale-foundation-world-model/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          Ver Genie 2 en DeepMind <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="rounded-md border border-border/40 p-3 space-y-2">
        <div className="text-xs font-medium">Alternativa libre disponible ahora</div>
        <p className="text-[11px] text-muted-foreground">
          Mientras Genie 2 no se abra, puedo prepararte un panel de
          <strong> video generativo gratis</strong> (imagen → video corto)
          usando Pollinations o un modelo libre equivalente. Dime y lo activo aquí.
        </p>
      </div>

      <div className="rounded-md border border-border/40 p-3 space-y-1">
        <div className="text-xs font-medium">Te aviso automáticamente</div>
        <p className="text-[11px] text-muted-foreground">
          Cuando DeepMind libere acceso (o aparezca un equivalente open source jugable),
          este panel se activará con un botón de "Crear mundo".
        </p>
      </div>
    </div>
  );
}
