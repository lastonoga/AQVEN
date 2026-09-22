import type { ThreadMessageLike } from "@assistant-ui/react"
import type { ApiChatEvent, ApprovalDecision } from "@/domain"

type EventOf<K extends ChatEventType> = Extract<ApiChatEvent, { readonly type: K }>

export type ChatEventType = ApiChatEvent["type"]
export type ChatState = EventOf<"chat_status">["state"]
export type ChatToolStatus = EventOf<"chat_tool_call_finished">["status"]
export type ChatFileChange = EventOf<"chat_file_edit">["change"]
export type ChatErrorCode = EventOf<"chat_error">["code"]

export type ToolFacet =
  | {
      readonly kind: "command"
      readonly command: string
      readonly description: string | null
      readonly exitCode: number | null
      readonly preview: string
      readonly truncated: boolean
    }
  | { readonly kind: "fileEdit"; readonly path: string; readonly change: ChatFileChange; readonly diff: string }
  | { readonly kind: "result"; readonly preview: string | null; readonly truncated: boolean }

export type ToolSnapshot = {
  readonly toolName: string
  readonly mcpServer: string | null
  readonly argsText: string
  readonly facet: ToolFacet | null
  readonly status: ChatToolStatus | null
}

export type ChatFailure = { readonly code: ChatErrorCode; readonly message: string; readonly retryable: boolean }

export type ReasoningSpan = { readonly startedAt: number; readonly endedAt: number | null; readonly tokens: number }

export type ReasoningSpans = Readonly<Record<string, ReasoningSpan>>

type ToolPart = ToolSnapshot & {
  readonly kind: "tool"
  readonly toolCallId: string
  readonly approval: { readonly id: string; readonly prompt: string | null; readonly decision: ApprovalDecision | null } | null
}

type ProsePart = { readonly kind: "text" | "reasoning"; readonly index: number; readonly text: string }

type ChatPart = ProsePart | ToolPart

type ChatMessage =
  | { readonly kind: "user"; readonly id: string; readonly text: string }
  | { readonly kind: "assistant"; readonly id: string; readonly parts: readonly ChatPart[]; readonly settled: boolean }

export type ChatTranscript = {
  readonly messages: readonly ChatMessage[]
  readonly state: ChatState
  readonly lastSeq: number
  readonly failure: ChatFailure | null
  readonly reasoning: ReasoningSpans
}

export const EMPTY_TRANSCRIPT: ChatTranscript = {
  messages: [],
  state: "idle",
  lastSeq: 0,
  failure: null,
  reasoning: {},
}

const FAILED_TOOL: readonly ChatToolStatus[] = ["error", "denied", "interrupted"]

const isToolPart = (part: ChatPart): part is ToolPart => part.kind === "tool"

const mapMessages = (transcript: ChatTranscript, update: (message: ChatMessage) => ChatMessage): ChatTranscript => ({
  ...transcript,
  messages: transcript.messages.map(update),
})

const withAssistant = (transcript: ChatTranscript, messageId: string, update: (parts: readonly ChatPart[]) => readonly ChatPart[]): ChatTranscript => {
  const known = transcript.messages.some((message) => message.kind === "assistant" && message.id === messageId)
  if (!known) return { ...transcript, messages: [...transcript.messages, { kind: "assistant", id: messageId, parts: update([]), settled: false }] }
  return mapMessages(transcript, (message) =>
    message.kind === "assistant" && message.id === messageId ? { ...message, parts: update(message.parts) } : message,
  )
}

const withTool = (transcript: ChatTranscript, toolCallId: string, update: (part: ToolPart) => ToolPart): ChatTranscript =>
  mapMessages(transcript, (message) => {
    if (message.kind !== "assistant") return message
    return { ...message, parts: message.parts.map((part) => (isToolPart(part) && part.toolCallId === toolCallId ? update(part) : part)) }
  })

const proseText = (parts: readonly ChatPart[], kind: ProsePart["kind"], index: number, delta: string): readonly ChatPart[] => {
  const known = parts.some((part) => part.kind === kind && part.index === index)
  if (!known) return [...parts, { kind, index, text: delta }]
  return parts.map((part) => (part.kind === kind && part.index === index ? { ...part, text: part.text + delta } : part))
}

type Fold<K extends ChatEventType> = (transcript: ChatTranscript, event: EventOf<K>) => ChatTranscript

const FOLD: { readonly [K in ChatEventType]: Fold<K> } = {
  chat_turn_started: (transcript, event) => ({
    ...transcript,
    failure: null,
    messages: [...transcript.messages, { kind: "user", id: event.client_op_id, text: event.text }],
  }),
  chat_text_delta: (transcript, event) => withAssistant(transcript, event.message_id, (parts) => proseText(parts, "text", event.part_index, event.delta)),
  chat_reasoning_delta: (transcript, event) =>
    withAssistant(transcript, event.message_id, (parts) => proseText(parts, "reasoning", event.part_index, event.delta)),
  chat_tool_call_started: (transcript, event) =>
    withAssistant(transcript, event.message_id, (parts) => [
      ...parts,
      {
        kind: "tool",
        toolCallId: event.tool_call_id,
        toolName: event.tool_name,
        mcpServer: event.mcp_server,
        argsText: "",
        facet: null,
        status: null,
        approval: null,
      },
    ]),
  chat_tool_call_args_delta: (transcript, event) => withTool(transcript, event.tool_call_id, (part) => ({ ...part, argsText: part.argsText + event.delta })),
  chat_tool_call_finished: (transcript, event) =>
    withTool(transcript, event.tool_call_id, (part) => ({
      ...part,
      status: event.status,
      argsText: JSON.stringify(event.input),
      facet: part.facet ?? { kind: "result", preview: event.result_preview, truncated: event.truncated },
    })),
  chat_command: (transcript, event) =>
    withTool(transcript, event.tool_call_id, (part) => ({
      ...part,
      facet: {
        kind: "command",
        command: event.command,
        description: event.description,
        exitCode: event.exit_code,
        preview: event.output_preview,
        truncated: event.truncated,
      },
    })),
  chat_file_edit: (transcript, event) =>
    withTool(transcript, event.tool_call_id, (part) => ({ ...part, facet: { kind: "fileEdit", path: event.path, change: event.change, diff: event.diff } })),
  chat_approval_requested: (transcript, event) =>
    withTool(transcript, event.tool_call_id, (part) => ({
      ...part,
      argsText: JSON.stringify(event.input),
      approval: { id: event.approval_id, prompt: event.reason, decision: null },
    })),
  chat_approval_resolved: (transcript, event) =>
    mapMessages(transcript, (message) => {
      if (message.kind !== "assistant") return message
      const parts = message.parts.map((part) =>
        isToolPart(part) && part.approval?.id === event.approval_id ? { ...part, approval: { ...part.approval, decision: event.decision } } : part,
      )
      return { ...message, parts }
    }),
  chat_status: (transcript, event) => ({ ...transcript, state: event.state }),
  chat_usage: (transcript) => transcript,
  chat_error: (transcript, event) => ({ ...transcript, failure: { code: event.code, message: event.message, retryable: event.retryable } }),
  chat_turn_finished: (transcript) => ({
    ...transcript,
    state: "idle",
    messages: transcript.messages.map((message) => (message.kind === "assistant" ? { ...message, settled: true } : message)),
  }),
}

const foldEvent = <K extends ChatEventType>(transcript: ChatTranscript, event: EventOf<K>): ChatTranscript => {
  const fold: Fold<K> = FOLD[event.type]
  return fold(transcript, event)
}

export const CHAT_EVENT_TYPES: readonly string[] = Object.keys(FOLD)

const openSpan = (spans: ReasoningSpans, messageId: string, at: number): ReasoningSpans => ({
  ...spans,
  [messageId]: { startedAt: spans[messageId]?.startedAt ?? at, endedAt: null, tokens: spans[messageId]?.tokens ?? 0 },
})

const countedSpan = (spans: ReasoningSpans, messageId: string | null | undefined, tokens: number): ReasoningSpans => {
  if (messageId === null || messageId === undefined || tokens === 0) return spans
  const span = spans[messageId]
  return span === undefined ? spans : { ...spans, [messageId]: { ...span, tokens } }
}

const closeSpans = (spans: ReasoningSpans, at: number): ReasoningSpans =>
  Object.fromEntries(
    Object.entries(spans).map(([messageId, span]) => [messageId, span.endedAt === null ? { ...span, endedAt: at } : span]),
  )

const ENDS_THINKING: readonly ChatEventType[] = [
  "chat_text_delta",
  "chat_tool_call_started",
  "chat_turn_started",
  "chat_turn_finished",
  "chat_error",
]

const spansAfter = (spans: ReasoningSpans, event: ApiChatEvent): ReasoningSpans => {
  const at = Date.parse(event.at)
  if (Number.isNaN(at)) return spans
  if (event.type === "chat_reasoning_delta") return openSpan(spans, event.message_id, at)
  if (event.type === "chat_usage") return countedSpan(spans, event.message_id, event.usage.thinking_tokens ?? 0)
  return ENDS_THINKING.includes(event.type) ? closeSpans(spans, at) : spans
}

export const applyChatEvent = (transcript: ChatTranscript, event: ApiChatEvent): ChatTranscript => {
  if (event.seq <= transcript.lastSeq) return transcript
  const folded = foldEvent(transcript, event)
  return { ...folded, reasoning: spansAfter(folded.reasoning, event), lastSeq: event.seq }
}

export const applyChatEvents = (transcript: ChatTranscript, events: readonly ApiChatEvent[]): ChatTranscript => events.reduce(applyChatEvent, transcript)

type ThreadPart = Exclude<ThreadMessageLike["content"], string>[number]

const toolResult = (part: ToolPart): string | undefined => {
  if (part.status === null) return undefined
  if (part.facet === null) return ""
  if (part.facet.kind === "command") return part.facet.preview
  if (part.facet.kind === "fileEdit") return part.facet.diff
  return part.facet.preview ?? ""
}

type ThreadToolPart = Extract<ThreadPart, { readonly type: "tool-call" }>
type PartApproval = NonNullable<ThreadToolPart["approval"]>

const withPrompt = (approval: PartApproval, prompt: string | null): PartApproval => (prompt === null ? approval : { ...approval, prompt })

const toolApproval = (part: ToolPart): PartApproval | undefined => {
  const approval = part.approval
  if (approval === null) return undefined
  const decided = approval.decision === null ? { id: approval.id } : { id: approval.id, approved: approval.decision === "allow" }
  return withPrompt(decided, approval.prompt)
}

const toolPart = (part: ToolPart): ThreadToolPart => ({
  type: "tool-call",
  toolCallId: part.toolCallId,
  toolName: part.toolName,
  argsText: part.argsText,
  artifact: { toolName: part.toolName, mcpServer: part.mcpServer, argsText: part.argsText, facet: part.facet, status: part.status },
  result: toolResult(part),
  isError: part.status !== null && FAILED_TOOL.includes(part.status),
})

const threadPart = (part: ChatPart): ThreadPart => {
  if (!isToolPart(part)) return part.kind === "text" ? { type: "text", text: part.text } : { type: "reasoning", text: part.text }
  const approval = toolApproval(part)
  return approval === undefined ? toolPart(part) : { ...toolPart(part), approval }
}

const threadMessage = (message: ChatMessage): ThreadMessageLike => {
  if (message.kind === "user") return { role: "user", id: message.id, content: [{ type: "text", text: message.text }] }
  return {
    role: "assistant",
    id: message.id,
    content: message.parts.map(threadPart),
    status: message.settled ? { type: "complete", reason: "stop" } : { type: "running" },
  }
}

export const threadMessages = (transcript: ChatTranscript): readonly ThreadMessageLike[] => transcript.messages.map(threadMessage)

export const isRunning = (transcript: ChatTranscript): boolean => transcript.state !== "idle"

const FACET_KINDS: readonly string[] = ["command", "fileEdit", "result"]
const TOOL_STATUSES: readonly string[] = ["ok", "error", "denied", "interrupted"]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const textOr = (value: unknown, fallback: string): string => (typeof value === "string" ? value : fallback)

const isFacet = (value: unknown): value is ToolFacet => isRecord(value) && typeof value["kind"] === "string" && FACET_KINDS.includes(value["kind"])

const isToolStatus = (value: unknown): value is ChatToolStatus => typeof value === "string" && TOOL_STATUSES.includes(value)

export const toolSnapshot = (artifact: unknown): ToolSnapshot | null => {
  if (!isRecord(artifact)) return null
  const toolName = artifact["toolName"]
  if (typeof toolName !== "string") return null
  const mcpServer = artifact["mcpServer"]
  const facet = artifact["facet"]
  const status = artifact["status"]
  return {
    toolName,
    mcpServer: typeof mcpServer === "string" ? mcpServer : null,
    argsText: textOr(artifact["argsText"], ""),
    facet: isFacet(facet) ? facet : null,
    status: isToolStatus(status) ? status : null,
  }
}
