import { useEffect, useState } from "react";

/**
 * Barras de onda que se animan mientras VEYMAR está hablando (speechSynthesis).
 */
export function SpeakingWaves() {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    let raf = 0;
    const tick = () => {
      setSpeaking(synth.speaking);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  if (!speaking) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-32 z-0 flex items-end justify-center gap-1 opacity-70">
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className="wave-bar block w-1.5 rounded-full bg-primary"
          style={{
            height: `${20 + (i % 5) * 14}px`,
            animationDelay: `${(i * 60) % 700}ms`,
            boxShadow: "0 0 12px var(--veymar-glow)",
          }}
        />
      ))}
    </div>
  );
}
