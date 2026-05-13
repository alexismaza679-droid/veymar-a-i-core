import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Download, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function ImageActions({ url, prompt }: { url: string; prompt?: string }) {
  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      const safe = (prompt || "veymar-imagen").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
      const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
      a.download = `${safe}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Imagen descargada.");
    } catch {
      toast.error("No se pudo descargar.");
    }
  };
  return (
    <div className="flex justify-end px-2 py-1 bg-background/40">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Opciones">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={download}>
            <Download className="h-4 w-4 mr-2" /> Descargar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Texto copiado.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar.");
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onCopy}
      title="Copiar texto"
      className="border border-border/40 rounded-md h-7 w-7"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
