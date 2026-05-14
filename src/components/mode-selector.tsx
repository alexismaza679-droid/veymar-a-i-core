import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, Zap, Sparkles, Telescope, ChevronDown } from "lucide-react";

export type VeymarMode = "fast" | "pro" | "expert" | "think";

export const MODE_META: Record<
  VeymarMode,
  { label: string; icon: any; desc: string }
> = {
  fast: { label: "Rápido", icon: Zap, desc: "Respuestas ágiles y breves" },
  pro: { label: "Pro", icon: Sparkles, desc: "Respuestas balanceadas y pulidas" },
  expert: { label: "Experto", icon: Telescope, desc: "Análisis profundo, nivel senior" },
  think: { label: "Pensar más", icon: Brain, desc: "Razonamiento extendido paso a paso" },
};

export function ModeSelector({
  mode,
  onChange,
}: {
  mode: VeymarMode;
  onChange: (m: VeymarMode) => void;
}) {
  const Meta = MODE_META[mode];
  const Icon = Meta.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          title="Cambiar modo de respuesta"
        >
          <Icon className="h-3.5 w-3.5 text-primary" />
          <span>{Meta.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em]">
          Modo de razonamiento
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(Object.keys(MODE_META) as VeymarMode[]).map((k) => {
          const M = MODE_META[k];
          const I = M.icon;
          return (
            <DropdownMenuItem key={k} onClick={() => onChange(k)} className="gap-2">
              <I className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm">
                  {M.label} {mode === k && <span className="text-primary">·</span>}
                </span>
                <span className="text-[10px] text-muted-foreground">{M.desc}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
