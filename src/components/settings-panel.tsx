import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Settings2, Play, Sparkles, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DEFAULT_VOICE_SETTINGS,
  getVoiceSettings,
  listAllVoices,
  listSpanishVoices,
  setVoiceSettings,
  speak,
  stopSpeaking,
} from "@/hooks/use-voice";

export function SettingsPanel({
  ownerName,
  onConfigureOwner,
}: {
  ownerName: string | null;
  onConfigureOwner: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(DEFAULT_VOICE_SETTINGS.rate);
  const [pitch, setPitch] = useState(DEFAULT_VOICE_SETTINGS.pitch);
  const [voiceName, setVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [groqKey, setGroqKey] = useState("");
  const [freeMode, setFreeMode] = useState(false);
  const [allVoices, setAllVoices] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      setGroqKey(localStorage.getItem("veymar.groq_key") || "");
      setFreeMode(localStorage.getItem("veymar.free_mode") === "1");
    } catch {}
    const s = getVoiceSettings();
    setRate(s.rate);
    setPitch(s.pitch);
    setVoice(s.voiceName);
    const load = () => setVoices(allVoices ? listAllVoices() : listSpanishVoices());
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, [open, allVoices]);

  const persist = (next: Partial<{ rate: number; pitch: number; voiceName: string | null }>) => {
    setVoiceSettings(next);
  };

  const test = () => {
    stopSpeaking();
    speak("A su servicio. Soy VEYMAR, una inteligencia diseñada para acompañarle con elegancia y precisión.");
  };

  const reset = () => {
    setRate(DEFAULT_VOICE_SETTINGS.rate);
    setPitch(DEFAULT_VOICE_SETTINGS.pitch);
    setVoice(null);
    setVoiceSettings({ ...DEFAULT_VOICE_SETTINGS });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Personalizar VEYMAR">
          <Settings2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[340px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="tracking-[0.2em] text-glow">PERSONALIZAR VEYMAR</SheetTitle>
          <SheetDescription>
            Ajusta voz, identidad y comportamiento. Tus cambios se guardan al instante.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2">
            <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Identidad</Label>
            <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
              <div>
                <div className="text-sm">Perfil de voz</div>
                <div className="text-xs text-muted-foreground">
                  {ownerName ? `Reconocido como: ${ownerName}` : "Sin perfil registrado"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onConfigureOwner}>
                Editar
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Modo Libre · Gratis e ilimitado</Label>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Conecta tu propia API key <strong>gratis de Groq</strong> (Llama 3.3 70B) y usa
              VEYMAR sin consumir créditos. Las imágenes se generan con Pollinations.ai (gratis, sin key).
            </p>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              Obtener key gratis en console.groq.com <ExternalLink className="h-3 w-3" />
            </a>
            <Input
              type="password"
              placeholder="gsk_..."
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <Label className="text-xs">Imágenes gratis (Pollinations)</Label>
              <Switch
                checked={freeMode}
                onCheckedChange={(v) => {
                  setFreeMode(v);
                  try { localStorage.setItem("veymar.free_mode", v ? "1" : "0"); } catch {}
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  try {
                    if (groqKey.trim()) {
                      localStorage.setItem("veymar.groq_key", groqKey.trim());
                      toast.success("Modo Libre activado · Groq conectado");
                    } else {
                      localStorage.removeItem("veymar.groq_key");
                      toast.info("Key eliminada · usando núcleo Lovable");
                    }
                  } catch {}
                }}
              >
                Guardar key
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGroqKey("");
                  try { localStorage.removeItem("veymar.groq_key"); } catch {}
                  toast.info("Key eliminada");
                }}
              >
                Quitar
              </Button>
            </div>
          </section>


          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Velocidad</Label>
            <Slider
              value={[rate]}
              min={0.7}
              max={1.5}
              step={0.02}
              onValueChange={(v) => {
                setRate(v[0]);
                persist({ rate: v[0] });
              }}
            />
            <div className="text-[10px] text-muted-foreground">{rate.toFixed(2)}x</div>
          </section>

          <section className="space-y-3">
            <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Tono (grave ↔ agudo)</Label>
            <Slider
              value={[pitch]}
              min={0.5}
              max={1.2}
              step={0.02}
              onValueChange={(v) => {
                setPitch(v[0]);
                persist({ pitch: v[0] });
              }}
            />
            <div className="text-[10px] text-muted-foreground">{pitch.toFixed(2)}</div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-[0.3em] text-primary">Voz del sistema</Label>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground">Todas las voces</Label>
                <Switch checked={allVoices} onCheckedChange={setAllVoices} />
              </div>
            </div>
            <select
              value={voiceName ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setVoice(val);
                persist({ voiceName: val });
                // Prueba inmediata para confirmar el cambio
                stopSpeaking();
                setTimeout(() => speak("Voz actualizada. A su servicio."), 80);
              }}
              className="w-full rounded-md border border-border/40 bg-background px-2 py-2 text-sm"
            >
              <option value="">Auto (mejor voz masculina)</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Para sonido tipo JARVIS, prueba "Microsoft Jorge", "Google español" o "Diego".
              Activa "Todas las voces" si tu navegador trae voces de otros idiomas.
            </p>
          </section>

          <div className="flex gap-2">
            <Button onClick={test} className="flex-1">
              <Play className="h-3.5 w-3.5 mr-2" /> Probar voz
            </Button>
            <Button variant="outline" onClick={reset}>
              Restaurar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
