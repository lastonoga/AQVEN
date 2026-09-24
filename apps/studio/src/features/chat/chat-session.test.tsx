import { act, fireEvent, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ApiChatEvent, ApiChatSession, ChatSessionId } from "@/domain"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { ChatSession } from "./chat-session"
import type { ChatTransport } from "./chat-transport"
import { liveTurnEvents } from "./test-support"

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

type Recorder = {
  readonly transport: ChatTransport
  readonly sent: string[]
  readonly interrupted: ChatSessionId[]
  readonly emit: (events: readonly ApiChatEvent[]) => void
}

const recorder = (): Recorder => {
  const sent: string[] = []
  const interrupted: ChatSessionId[] = []
  const listeners: ((event: ApiChatEvent) => void)[] = []
  const transport: ChatTransport = {
    subscribe: (_sessionId, _afterSeq, onEvent) => {
      listeners.push(onEvent)
      return () => listeners.splice(listeners.indexOf(onEvent), 1)
    },
    send: (_sessionId, text) => {
      sent.push(text)
      return Promise.resolve()
    },
    respond: () => Promise.resolve(),
    interrupt: (sessionId) => {
      interrupted.push(sessionId)
      return Promise.resolve()
    },
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
  return { transport, sent, interrupted, emit }
}

const mount = (transport: ChatTransport) => {
  render(
    <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
      <TooltipProvider>
        <ChatSession session={SESSION} transport={transport} />
      </TooltipProvider>
    </IntlProvider>,
  )
}

const composer = (): HTMLTextAreaElement => screen.getByPlaceholderText<HTMLTextAreaElement>(messages.en.chat.composer.placeholder)

const upTo = (seq: number): readonly ApiChatEvent[] => liveTurnEvents.filter((event) => event.seq <= seq)

const QUEUED_AT = "2026-09-17T21:55:50Z"
const TURN_ID = "01a0b15e-6a13-7571-9226-48395adeb839"

const queuedEvent = (seq: number, delivery: "next_step" | "after_turn"): ApiChatEvent => ({
  seq,
  at: QUEUED_AT,
  session_id: SESSION.session_id,
  turn_id: TURN_ID,
  type: "chat_message_queued",
  client_op_id: "op-2",
  text: "also run the tests",
  delivery,
})

describe("ChatSession", () => {
  it("renders the streamed turn and offers Stop while the agent runs", () => {
    const { transport, emit } = recorder()
    mount(transport)
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined()

    emit(upTo(4))
    expect(screen.getByText("List the flow ids in this project with one Bash command, then answer in one short sentence.")).toBeDefined()
    expect(screen.getByRole("button", { name: "Toggle the thinking" }).textContent).toContain("Thinking…")
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined()

    emit(liveTurnEvents)
    expect(screen.getByText(/Two flows/)).toBeDefined()
    expect(screen.getByText("judge_panel")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined()
  })

  it("leaves the running state to the thread itself instead of repeating it below", () => {
    const { transport, emit } = recorder()
    mount(transport)
    expect(screen.queryByRole("status")).toBeNull()

    emit(upTo(4))
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByRole("button", { name: "Toggle the thinking" }).textContent).toContain("Thinking…")

    emit(upTo(42))
    expect(screen.getByRole("status").textContent).toContain("Working…")
    expect(screen.getByRole("button", { name: "Toggle the thinking" }).textContent).toContain("Thought for")

    emit(liveTurnEvents)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("shows the Bash tool call the engine reported", () => {
    const { transport, emit } = recorder()
    mount(transport)
    emit(liveTurnEvents)
    expect(screen.getByText('grep -H "^id:" flows/*/flow.yaml')).toBeDefined()
  })

  it("posts the composed text once and interrupts the running turn once", async () => {
    const { transport, sent, interrupted, emit } = recorder()
    mount(transport)
    fireEvent.change(composer(), { target: { value: "hello engine" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }))
      await Promise.resolve()
    })
    expect(sent).toEqual(["hello engine"])

    emit(upTo(2))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }))
      await Promise.resolve()
    })
    expect(interrupted).toEqual([SESSION.session_id])
  })

  it("keeps Send beside Stop while the agent runs and shows what Enter queued", async () => {
    const { transport, sent, emit } = recorder()
    mount(transport)
    emit(upTo(4))
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined()

    fireEvent.change(composer(), { target: { value: "also run the tests" } })
    await act(async () => {
      fireEvent.keyDown(composer(), { key: "Enter" })
      await Promise.resolve()
    })
    expect(sent).toEqual(["also run the tests"])

    emit([queuedEvent(5, "next_step")])
    const waiting = screen.getByRole("list", { name: messages.en.chat.queued.aria })
    expect(waiting.textContent).toContain("also run the tests")
    expect(waiting.textContent).toContain(messages.en.chat.queued.next_step)

    emit([{ seq: 6, at: QUEUED_AT, session_id: SESSION.session_id, turn_id: TURN_ID, type: "chat_message_delivered", client_op_id: "op-2" }])
    expect(screen.queryByRole("list", { name: messages.en.chat.queued.aria })).toBeNull()
    expect(screen.getByText("also run the tests")).toBeDefined()
  })

  it("says a message waits for the next turn when the agent cannot take it now", () => {
    const { transport, emit } = recorder()
    mount(transport)
    emit([...upTo(4), queuedEvent(5, "after_turn")])
    expect(screen.getByRole("list", { name: messages.en.chat.queued.aria }).textContent).toContain(messages.en.chat.queued.after_turn)
  })
})
