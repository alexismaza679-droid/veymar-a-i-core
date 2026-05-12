import veymarCore from "@/assets/veymar-core.png";
import { cn } from "@/lib/utils";

export function VeymarLogo({ className, animated = true }: { className?: string; animated?: boolean }) {
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,var(--veymar-glow),transparent_70%)] blur-xl" />
      <img
        src={veymarCore}
        alt="VEYMAR A.I."
        width={64}
        height={64}
        className={cn("relative h-full w-full object-contain", animated && "animate-veymar-spin")}
      />
    </div>
  );
}
