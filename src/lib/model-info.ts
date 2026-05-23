import type { VeymarMode } from "@/components/mode-selector";

export function getActiveModel(mode: VeymarMode, hasGroqKey: boolean): {
  id: string;
  provider: "Groq" | "Lovable";
} {
  if (hasGroqKey) {
    return {
      id: mode === "fast" ? "llama-3.1-8b-instant" : "llama-3.3-70b-versatile",
      provider: "Groq",
    };
  }
  const id =
    mode === "fast"
      ? "gemini-3.1-flash-lite"
      : mode === "think" || mode === "expert"
        ? "gemini-3.1-pro"
        : "gemini-3-flash";
  return { id, provider: "Lovable" };
}
