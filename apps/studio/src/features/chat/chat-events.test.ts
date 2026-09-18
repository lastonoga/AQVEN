import { describe, expect, it } from "vitest"
import type { ApiChatEvent } from "@/domain"
import { applyChatEvents, EMPTY_TRANSCRIPT, isRunning, threadMessages, toolSnapshot } from "./chat-events"
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
