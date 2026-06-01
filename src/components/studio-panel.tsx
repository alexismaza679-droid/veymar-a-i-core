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
import { Switch } from "@/components/ui/switch";
import { Wand2, Music2, Upload, ExternalLink, Sparkles, Gamepad2, Loader2, Video } from "lucide-react";
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

// Re-renderiza un audio cambiándole el tempo (con cambio de tono leve).
// Simple y suficiente para "forzar" un BPM objetivo.
async function timeStretchToBpm(blobUrl: string, fromBpm: number, toBpm: number): Promise<string> {
  if (!fromBpm || !toBpm || fromBpm === toBpm) return blobUrl;
  const ratio = toBpm / fromBpm; // >1 acelera, <1 ralentiza
  const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
  const resp = await fetch(blobUrl);
  const buf = await resp.arrayBuffer();
  const decoded = await ac.decodeAudioData(buf);
  ac.close();
  const newLen = Math.floor(decoded.length / ratio);
  const off = new OfflineAudioContext(decoded.numberOfChannels, newLen, decoded.sampleRate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = ratio;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  // WAV encode rápido
  return bufferToWavDataUrl(out);
}

function bufferToWavDataUrl(buffer: AudioBuffer): string {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF"); view.setUint32(4, len - 8, true); writeStr(8, "WAVE");
  writeStr(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true); view.setUint16(34, 16, true);
  writeStr(36, "data"); view.setUint32(40, len - 44, true);
  let off = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  // base64
  const bytes = new Uint8Array(ab);
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
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
  const [targetBpm, setTargetBpm] = useState<string>("");
  const [forceTempo, setForceTempo] = useState(false);
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
      setTargetBpm(String(a.bpm));
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

    const tBpm = Number(targetBpm) || analysis?.bpm || 0;
    // Prompt enriquecido con BPM/tonalidad
    const bits = [prompt];
    if (tBpm) bits.push(`exactly ${tBpm} BPM`);
    if (analysis?.key) bits.push(`tonalidad ${analysis.key}`);
    if (lyrics) bits.push(`Letra guía: ${lyrics.slice(0, 200)}`);
    const enriched = bits.join(". ");

    await Promise.all(
      models.map(async (model) => {
        try {
          const res = await fetch("/api/music", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: enriched, model, duration, targetBpm: tBpm || undefined }),
          });
          if (!res.ok) {
            const txt = await res.text();
            setTracks((t) =>
              t.map((x) => (x.model === model ? { ...x, error: txt || `HTTP ${res.status}` } : x)),
            );
            return;
          }
          const json = (await res.json()) as { url?: string; error?: string };
          let finalUrl = json.url ?? null;
          // Forzar tempo en cliente si el usuario lo pidió y tenemos referencia analizada.
          if (finalUrl && forceTempo && analysis?.bpm && tBpm && analysis.bpm !== tBpm) {
            try {
              finalUrl = await timeStretchToBpm(finalUrl, analysis.bpm, tBpm);
            } catch (e) {
              console.warn("force tempo failed", e);
            }
          }
          setTracks((t) =>
            t.map((x) =>
              x.model === model ? { ...x, url: finalUrl, error: json.error } : x,
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
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-200/90">
        HF_TOKEN configurado · generación estable con MusicGen (Meta) · gratis.
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
            <div>Detectado: <strong>{analysis.bpm}</strong> BPM · tonalidad <strong>{analysis.key}</strong></div>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-md border border-border/40 p-2">
        <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">
          BPM objetivo (manual)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={40}
            max={240}
            placeholder="120"
            value={targetBpm}
            onChange={(e) => setTargetBpm(e.target.value)}
            className="h-8 text-xs"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">BPM</span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            <div className="text-xs">Forzar tempo del resultado</div>
            <div className="text-[10px] text-muted-foreground">
              Re-procesa el audio para igualar el BPM (puede cambiar el tono).
            </div>
          </div>
          <Switch checked={forceTempo} onCheckedChange={setForceTempo} />
        </div>
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
        <div className="flex items-center gap-2 text-xs font-medium">
          <Video className="h-3.5 w-3.5 text-primary" /> ¿Qué es el "video libre"?
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Como Genie 2 no es público, lo más cercano <strong>y gratis</strong> que puedo
          activar aquí es <em>imagen → video corto</em> usando modelos libres
          (Stable Video Diffusion / AnimateDiff vía HuggingFace, o Pollinations para clips).
          Subes una imagen, das una instrucción de movimiento y obtienes un clip de 2–4s.
          No es un mundo jugable, pero es lo más parecido disponible sin pagar.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Dime "activa video libre" y lo añado en este mismo panel.
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
