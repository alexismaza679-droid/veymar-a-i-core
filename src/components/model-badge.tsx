import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { getActiveModel } from "@/lib/model-info";
import type { VeymarMode } from "./mode-selector";

export function ModelBadge({ mode }: { mode: VeymarMode }) {
  const [hasGroq, setHasGroq] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setHasGroq(!!localStorage.getItem("veymar.groq_key"));
      } catch {}
    };
    read();
    window.addEventListener("storage", read);
    const id = setInterval(read, 1500);
    return () => {
      window.removeEventListener("storage", read);
      clearInterval(id);
    };
  }, []);
  const { id, provider } = getActiveModel(mode, hasGroq);
  return (
    <span
      title={`Modelo en uso: ${id} (${provider})`}
      className="hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-mono text-primary/90"
    >
      <Cpu className="h-3 w-3" />
      <span className="truncate max-w-[140px]">{id}</span>
      <span className="opacity-50">·</span>
      <span className="opacity-80">{provider}</span>
    </span>
  );
}
