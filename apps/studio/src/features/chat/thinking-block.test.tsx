import { act, fireEvent, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ApiChatEvent, ApiChatSession } from "@/domain"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { ChatSession } from "./chat-session"
import type { ChatTransport } from "./chat-transport"

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

const THOUGHT = "Weighing the two providers."
const base = { session_id: SESSION.session_id, turn_id: "turn-1" } as const

const at = (second: number): string => `2026-09-17T21:55:${String(second).padStart(2, "0")}.000000Z`

const STARTED: ApiChatEvent = { ...base, seq: 1, at: at(10), type: "chat_turn_started", client_op_id: "op-1", text: "pick one", backend: "claude", model: null }
const THINKING: ApiChatEvent = { ...base, seq: 2, at: at(11), type: "chat_status", state: "thinking" }
const REASONED: ApiChatEvent = { ...base, seq: 3, at: at(12), type: "chat_reasoning_delta", message_id: "msg-1", part_index: 0, delta: THOUGHT }
const METERED: ApiChatEvent = {
  ...base,
  seq: 4,
  at: at(13),
  type: "chat_usage",
  message_id: "msg-1",
  usage: {
    model: "claude-haiku-4-5",
    tokens_in: 12,
    tokens_out: 640,
    thinking_tokens: 430,
    cache_read_tokens: 13600,
    cache_write_tokens: 0,
    cost_usd: null,
  },
}
const SPOKE: ApiChatEvent = { ...base, seq: 5, at: at(21), type: "chat_text_delta", message_id: "msg-1", part_index: 1, delta: "OpenRouter." }

const mounted = () => {
  const listeners: ((event: ApiChatEvent) => void)[] = []
  const transport: ChatTransport = {
    subscribe: (_sessionId, _afterSeq, onEvent) => {
      listeners.push(onEvent)
      return () => listeners.splice(listeners.indexOf(onEvent), 1)
    },
    send: () => Promise.resolve(),
    respond: () => Promise.resolve(),
    interrupt: () => Promise.resolve(),
  }
  render(
    <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
      <TooltipProvider>
        <ChatSession session={SESSION} transport={transport} />
      </TooltipProvider>
    </IntlProvider>,
  )
  return (events: readonly ApiChatEvent[]): void => {
    act(() => {
      events.forEach((event) => {
        listeners.forEach((listener) => {
          listener(event)
        })
      })
    })
  }
}

const thinkingLine = (): string => screen.getByRole("button", { name: "Toggle the thinking" }).textContent

describe("thinking", () => {
  it("counts the seconds of a long think instead of showing the thought itself", () => {
    const emit = mounted()

    emit([STARTED, THINKING, REASONED])

    expect(screen.getByRole("button", { name: "Toggle the thinking" }).textContent).toContain("Thinking…")
    expect(screen.queryByText(THOUGHT)).toBeNull()
  })

  it("hands over the thought to whoever asks for it", () => {
    const emit = mounted()
    emit([STARTED, THINKING, REASONED])

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Toggle the thinking" }))
    })

    expect(screen.getByText(THOUGHT)).toBeDefined()
  })

  it("reports how long the thinking took and folds it away once the answer starts", () => {
    const emit = mounted()

    emit([STARTED, THINKING, REASONED, SPOKE])

    expect(screen.getByRole("button", { name: "Toggle the thinking" }).textContent).toContain("Thought for 9s")
    expect(screen.queryByText(THOUGHT)).toBeNull()
  })

  it("counts what the thinking itself cost, not the whole conversation", () => {
    const emit = mounted()

    emit([STARTED, THINKING, REASONED, METERED, SPOKE])

    expect(thinkingLine()).toContain("Thought for 9s")
    expect(thinkingLine()).toContain("430 thinking tokens")
  })

  it("waits for the count instead of guessing while the thinking runs", () => {
    const emit = mounted()

    emit([STARTED, THINKING, REASONED, METERED])

    expect(thinkingLine()).toContain("Thinking…")
    expect(thinkingLine()).not.toContain("tokens")
  })

  it("keeps the foot of the thread empty while the thinking speaks for the agent", () => {
    const emit = mounted()

    emit([STARTED, THINKING, REASONED, METERED])

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("says the agent is working when there is no thinking to show", () => {
    const emit = mounted()

    emit([STARTED, THINKING])

    expect(screen.getByRole("status").textContent).toContain("Working…")
  })

  it("drops the loader as soon as the thinking takes over", () => {
    const emit = mounted()
    emit([STARTED, THINKING])

    emit([REASONED])

    expect(screen.queryByRole("status")).toBeNull()
  })
})
