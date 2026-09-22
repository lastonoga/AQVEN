export const TONES = ["neutral", "primary", "llm", "tool", "loop", "success", "warning", "destructive", "anthropic", "openai", "google", "mistral"] as const
export type Tone = (typeof TONES)[number]
