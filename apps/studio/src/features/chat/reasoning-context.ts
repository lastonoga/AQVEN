import { createContext, useContext } from "react"
import type { ReasoningSpan, ReasoningSpans } from "./chat-events"

export const NO_SPANS: ReasoningSpans = {}

export const ReasoningSpanContext = createContext<ReasoningSpans>(NO_SPANS)

export function useReasoningSpan(messageId: string): ReasoningSpan | null {
  return useContext(ReasoningSpanContext)[messageId] ?? null
}

export function useThinkingNow(): boolean {
  return Object.values(useContext(ReasoningSpanContext)).some((span) => span.endedAt === null)
}
