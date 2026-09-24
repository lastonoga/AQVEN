import { act, fireEvent, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ApiChatApprovalReply, ApiChatEvent, ApiChatSession } from "@/domain"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { ChatSession } from "./chat-session"
import type { ChatTransport } from "./chat-transport"
import { liveOnly } from "./transport-double"

const SESSION: ApiChatSession = {
  session_id: "01a0b15e-69af-71c7-a54d-213c4df2385e",
  backend: "claude",
  project_root: "/tmp/lumen",
  flow_id: "support_case",
  model: null,
  permission_mode: "default",
  created_at: "2026-09-17T21:55:49.808312Z",
  last_seq: 0,
}

const PROVIDER = "Which provider should the flow call?"
const GATE = "Which checks belong in the gate?"

const ASKED = {
  questions: [
    {
      question: PROVIDER,
      header: "Provider",
      multiSelect: false,
      options: [
        { label: "OpenRouter", description: "One key for every model." },
        { label: "OpenAI", description: "Direct, no routing hop." },
      ],
    },
    {
      question: GATE,
      header: "Gate",
      multiSelect: true,
      options: [
        { label: "Citations", description: "Every claim carries a source." },
        { label: "Latency", description: "p95 under the budget." },
      ],
    },
  ],
}

const stamp = { at: "2026-09-17T21:55:49.9Z", session_id: SESSION.session_id, turn_id: "turn-1" } as const

const ASK_EVENTS: readonly ApiChatEvent[] = [
  { ...stamp, seq: 1, type: "chat_turn_started", client_op_id: "op-1", text: "build me a flow", backend: "claude", model: null, origin: "user" },
  { ...stamp, seq: 2, type: "chat_tool_call_started", message_id: "msg-1", tool_call_id: "toolu_ask", tool_name: "AskUserQuestion", mcp_server: null },
  { ...stamp, seq: 3, type: "chat_approval_requested", approval_id: "approval-1", tool_call_id: "toolu_ask", tool_name: "AskUserQuestion", input: ASKED, reason: null },
]

type Reply = { readonly approvalId: string; readonly reply: ApiChatApprovalReply }

const recorder = (): { readonly transport: ChatTransport; readonly replies: Reply[]; readonly emit: (events: readonly ApiChatEvent[]) => void } => {
  const replies: Reply[] = []
  const listeners: ((event: ApiChatEvent) => void)[] = []
  const transport: ChatTransport = {
    ...liveOnly(listeners),
    send: () => Promise.resolve(),
    respond: (_sessionId, approvalId, reply) => {
      replies.push({ approvalId, reply })
      return Promise.resolve()
    },
    interrupt: () => Promise.resolve(),
  }
  const emit = (events: readonly ApiChatEvent[]): void => {
    act(() => {
      events.forEach((event) => {
        listeners.forEach((listener) => {
          listener(event)
        })
      })
    })
  }
  return { transport, replies, emit }
}

const asked = () => {
  const found = recorder()
  render(
    <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
      <TooltipProvider>
        <ChatSession session={SESSION} transport={found.transport} />
      </TooltipProvider>
    </IntlProvider>,
  )
  found.emit(ASK_EVENTS)
  return found
}

const option = (name: string): HTMLElement => screen.getByRole(name === "Citations" || name === "Latency" ? "checkbox" : "radio", { name: new RegExp(name) })

const submit = (): HTMLButtonElement => screen.getByRole<HTMLButtonElement>("button", { name: "Send answers" })

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(element)
    await Promise.resolve()
  })
}

describe("AskUserQuestion", () => {
  it("shows every question with its own options instead of the raw arguments", () => {
    asked()

    expect(screen.getByText(PROVIDER)).toBeDefined()
    expect(screen.getByText(GATE)).toBeDefined()
    expect(screen.getByText("One key for every model.")).toBeDefined()
    expect(screen.queryByText(/q\[0\]/)).toBeNull()
  })

  it("keeps every answer local until one send carries the whole batch", async () => {
    const { replies } = asked()
    expect(submit().disabled).toBe(true)

    await click(option("OpenRouter"))
    expect(replies).toEqual([])
    expect(submit().disabled).toBe(true)

    await click(option("Citations"))
    await click(option("Latency"))
    expect(replies).toEqual([])
    expect(submit().disabled).toBe(false)

    await click(submit())
    expect(replies).toEqual([
      {
        approvalId: "approval-1",
        reply: { decision: "allow", message: null, answers: { [PROVIDER]: "OpenRouter", [GATE]: "Citations, Latency" } },
      },
    ])
  })

  it("replaces a choice rather than adding to it when the question takes one answer", async () => {
    const { replies } = asked()

    await click(option("OpenRouter"))
    await click(option("OpenAI"))
    await click(option("Citations"))
    await click(submit())

    expect(replies[0]?.reply.answers).toEqual({ [PROVIDER]: "OpenAI", [GATE]: "Citations" })
  })

  it("sends what the person wrote when they answer in their own words", async () => {
    const { replies } = asked()

    await click(option("Citations"))
    await click(screen.getByRole("radio", { name: /Other/ }))
    fireEvent.change(screen.getByLabelText("Your own answer for Provider"), { target: { value: "Fireworks, for the price" } })
    await click(submit())

    expect(replies[0]?.reply.answers).toEqual({ [PROVIDER]: "Fireworks, for the price", [GATE]: "Citations" })
  })

  it("hands the answers back when the agent refuses them instead of going quiet", async () => {
    const found = recorder()
    const failing: ChatTransport = { ...found.transport, respond: () => Promise.reject(new Error("422")) }
    render(
      <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
        <TooltipProvider>
          <ChatSession session={SESSION} transport={failing} />
        </TooltipProvider>
      </IntlProvider>,
    )
    found.emit(ASK_EVENTS)

    await click(option("OpenRouter"))
    await click(option("Citations"))
    await click(submit())

    expect(screen.getByText("The answers did not reach the agent. Try again.")).toBeDefined()
    expect(submit().disabled).toBe(false)
  })

  it("lets the person skip the whole batch without choosing anything", async () => {
    const { replies } = asked()

    await click(screen.getByRole("button", { name: "Skip" }))

    expect(replies).toEqual([{ approvalId: "approval-1", reply: { decision: "allow", message: null, answers: {} } }])
  })
})
