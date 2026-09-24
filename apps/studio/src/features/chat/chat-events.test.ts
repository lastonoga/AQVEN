import { describe, expect, it } from "vitest"
import type { ApiChatEvent } from "@/domain"
import { applyChatEvents, CONTINUATION_MARK, EMPTY_TRANSCRIPT, isRunning, threadMessages, toolSnapshot } from "./chat-events"
import { liveTurnEvents } from "./test-support"

const folded = () => applyChatEvents(EMPTY_TRANSCRIPT, liveTurnEvents)

const assistantParts = (events: readonly ApiChatEvent[]) => {
  const [, assistant] = threadMessages(applyChatEvents(EMPTY_TRANSCRIPT, events))
  return typeof assistant?.content === "string" ? [] : (assistant?.content ?? [])
}

const TOOL_CALL_ID = "toolu_012hvs5d2x1BUYDVBXx1dcbo"

const APPROVAL_REQUESTED: ApiChatEvent = {
  seq: 200,
  at: "2026-09-17T21:56:00Z",
  session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
  turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
  type: "chat_approval_requested",
  approval_id: "ap_1",
  tool_call_id: TOOL_CALL_ID,
  tool_name: "Bash",
  input: {},
  reason: "Bash needs permission",
}

const APPROVAL_DENIED: ApiChatEvent = {
  seq: 201,
  at: "2026-09-17T21:56:01Z",
  session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
  turn_id: "01a0b15e-6a13-7571-9226-48395adeb839",
  type: "chat_approval_resolved",
  approval_id: "ap_1",
  decision: "deny",
  resolved_by: "user",
}

describe("applyChatEvents", () => {
  it("folds a recorded turn into a user message and one assistant message", () => {
    const transcript = folded()
    expect(transcript.lastSeq).toBe(179)
    expect(transcript.state).toBe("idle")
    expect(transcript.failure).toBeNull()
    expect(isRunning(transcript)).toBe(false)
    const messages = threadMessages(transcript)
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"])
    expect(messages[0]?.content).toEqual([{ type: "text", text: "List the flow ids in this project with one Bash command, then answer in one short sentence." }])
  })

  it("concatenates deltas without touching the individual chunks", () => {
    const parts = assistantParts(liveTurnEvents)
    expect(parts[0]).toEqual({ type: "reasoning", text: "The user wants flow ids listed using" })
    const answer = threadMessages(folded()).at(-1)
    expect(answer?.content).toEqual([{ type: "text", text: "Two flows: `judge_panel` and `support_case` (ids" }])
  })

  it("attaches the chat_command facet to the tool call it names", () => {
    const [, tool] = assistantParts(liveTurnEvents)
    expect(tool).toMatchObject({
      type: "tool-call",
      toolCallId: TOOL_CALL_ID,
      toolName: "Bash",
      isError: false,
      result: "(Bash completed with no output)",
    })
    expect(toolSnapshot(tool && "artifact" in tool ? tool.artifact : null)).toEqual({
      toolName: "Bash",
      mcpServer: null,
      argsText: JSON.stringify({ command: 'grep -H "^id:" flows/*/flow.yaml', description: "Print flow ids" }),
      status: "ok",
      facet: {
        kind: "command",
        command: 'grep -H "^id:" flows/*/flow.yaml',
        description: "Print flow ids",
        exitCode: null,
        preview: "(Bash completed with no output)",
        truncated: false,
      },
    })
  })

  it("ignores events the reconnect replays", () => {
    const once = folded()
    const replayed = applyChatEvents(once, liveTurnEvents.filter((event) => event.seq >= 41))
    expect(replayed).toEqual(once)
  })

  it("records an approval request and the decision that answers it", () => {
    const asked = assistantParts([...liveTurnEvents, APPROVAL_REQUESTED])
    expect(asked[1]).toMatchObject({ approval: { id: "ap_1", prompt: "Bash needs permission" } })
    const answered = assistantParts([...liveTurnEvents, APPROVAL_REQUESTED, APPROVAL_DENIED])
    expect(answered[1]).toMatchObject({ approval: { id: "ap_1", approved: false } })
  })
})

const QUEUED_AT = "2026-09-17T21:56:04Z"
const SESSION_ID = "01a0b15e-69af-71c7-a54d-213c4df2385e"
const TURN_ID = "01a0b15e-6a13-7571-9226-48395adeb839"
const FOLLOW_UP = "Also run the tests."

const running = liveTurnEvents.filter((event) => event.seq <= 44)

const queuedEvent = (seq: number, delivery: "next_step" | "after_turn"): ApiChatEvent => ({
  seq,
  at: QUEUED_AT,
  session_id: SESSION_ID,
  turn_id: TURN_ID,
  type: "chat_message_queued",
  client_op_id: "op-2",
  text: FOLLOW_UP,
  delivery,
})

const deliveredEvent = (seq: number): ApiChatEvent => ({
  seq,
  at: QUEUED_AT,
  session_id: SESSION_ID,
  turn_id: TURN_ID,
  type: "chat_message_delivered",
  client_op_id: "op-2",
})

const followUpTurn = (seq: number): ApiChatEvent => ({
  seq,
  at: QUEUED_AT,
  session_id: SESSION_ID,
  turn_id: "turn-2",
  type: "chat_turn_started",
  client_op_id: "op-2",
  text: FOLLOW_UP,
  backend: "claude",
  model: null,
  origin: "user",
})

const userTexts = (events: readonly ApiChatEvent[]): readonly unknown[] =>
  threadMessages(applyChatEvents(EMPTY_TRANSCRIPT, events))
    .filter((message) => message.role === "user")
    .map((message) => message.content)

describe("messages sent while the agent works", () => {
  it("keeps a queued message out of the thread until the agent reads it", () => {
    const queued = applyChatEvents(EMPTY_TRANSCRIPT, [...running, queuedEvent(45, "next_step")])
    expect(queued.queued).toEqual([{ id: "op-2", text: FOLLOW_UP, delivery: "next_step" }])
    expect(userTexts([...running, queuedEvent(45, "next_step")])).toHaveLength(1)

    const delivered = applyChatEvents(queued, [deliveredEvent(46)])
    expect(delivered.queued).toEqual([])
    expect(threadMessages(delivered).at(-1)).toEqual({ role: "user", id: "op-2", content: [{ type: "text", text: FOLLOW_UP }] })
  })

  it("hands a message queued for after the turn to the turn it opens", () => {
    const events = [...running, queuedEvent(45, "after_turn"), followUpTurn(46)]
    const transcript = applyChatEvents(EMPTY_TRANSCRIPT, events)
    expect(transcript.queued).toEqual([])
    expect(userTexts(events)).toEqual([
      [{ type: "text", text: "List the flow ids in this project with one Bash command, then answer in one short sentence." }],
      [{ type: "text", text: FOLLOW_UP }],
    ])
  })

  it("updates the promise when the backend moves a message to the next turn", () => {
    const transcript = applyChatEvents(EMPTY_TRANSCRIPT, [...running, queuedEvent(45, "next_step"), queuedEvent(46, "after_turn")])
    expect(transcript.queued).toEqual([{ id: "op-2", text: FOLLOW_UP, delivery: "after_turn" }])
  })
})

const WOKE_AT = "2026-09-17T21:57:00Z"
const WOKE_TURN = "turn-woke"

const wokeStamp = (seq: number) => ({ seq, at: WOKE_AT, session_id: SESSION_ID, turn_id: WOKE_TURN })

const continuation: readonly ApiChatEvent[] = [
  { ...wokeStamp(180), type: "chat_turn_started", client_op_id: "op-woke", text: "", backend: "claude", model: null, origin: "continuation" },
  { ...wokeStamp(181), type: "chat_status", state: "streaming" },
  { ...wokeStamp(182), type: "chat_text_delta", message_id: "msg_woke", part_index: 0, delta: "The background build passed." },
]

describe("a turn the agent opens on its own", () => {
  it("marks where the agent continued instead of showing an empty user message, and runs until it finishes", () => {
    const transcript = applyChatEvents(EMPTY_TRANSCRIPT, [...liveTurnEvents, ...continuation])
    const messages = threadMessages(transcript)

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant", "system", "assistant"])
    expect(messages.at(-2)).toEqual({ role: "system", id: "op-woke", content: [{ type: "text", text: CONTINUATION_MARK }] })
    expect(messages.at(-1)?.content).toEqual([{ type: "text", text: "The background build passed." }])
    expect(isRunning(transcript)).toBe(true)

    const finished = applyChatEvents(transcript, [
      { ...wokeStamp(183), type: "chat_turn_finished", stop_reason: "interrupted", duration_ms: 900, usage: null, backend: "claude", model: null, reason: "stop_forced" },
    ])
    expect(isRunning(finished)).toBe(false)
  })
})
