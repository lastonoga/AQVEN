import { createTranslator } from "use-intl"
import type { ChatMessage, ChatThread, ChatToolCallPart } from "@/domain"
import type { Inline, Span } from "@/components/studio"
import { messages } from "@/i18n/messages"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { chatThreads } from "@/mocks/data/chat"
import type { ToolCallSnapshot } from "./tool-card-model"
import type { ToolContext } from "./tool-context"

export type NavigationLog = string[]

export const chatTranslator = createTranslator({ locale: "en", messages: messages.en, namespace: "chat" })

export const toolContext = (log: NavigationLog): ToolContext => ({
  t: chatTranslator,
  openRun: (run) => {
    log.push(`run ${run}`)
  },
  openAttempts: (run, columnId) => {
    log.push(`attempts ${run} ${columnId}`)
  },
  openCall: (run, call, tab) => {
    log.push(`call ${run} ${call} ${tab}`)
  },
})

const isSpanList = (value: Inline): value is readonly Span[] => Array.isArray(value)

export const inlineText = (value: Inline): string => {
  if (typeof value === "string") return value
  if (isSpanList(value)) return value.map((span) => span.text).join("")
  return value.text
}

export const designedThread = (): ChatThread => chatThreads[workflowKey(WORKFLOWS.pitchPipeline)] ?? []

const toolCalls = (message: ChatMessage): readonly ChatToolCallPart[] => {
  if (message.role === "user") return []
  return message.content.filter((part): part is ChatToolCallPart => part.type === "tool-call")
}

export const threadToolCalls = (thread: ChatThread): readonly ChatToolCallPart[] => thread.flatMap(toolCalls)

export const designedToolCall = (toolCallId: string): ChatToolCallPart => {
  const part = threadToolCalls(designedThread()).find((candidate) => candidate.toolCallId === toolCallId)
  if (part === undefined) throw new Error(`${toolCallId} is missing from the designed thread`)
  return part
}

export const snapshotOf = (part: ChatToolCallPart, statusType: string): ToolCallSnapshot => ({
  toolName: part.toolName,
  args: part.args,
  result: "result" in part ? part.result : undefined,
  artifact: "artifact" in part ? part.artifact : undefined,
  isError: part.isError === true,
  statusType,
})
