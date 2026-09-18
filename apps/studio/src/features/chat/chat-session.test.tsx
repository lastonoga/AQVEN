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

describe("ChatSession", () => {
  it("renders the streamed turn and swaps Send for Stop while the agent runs", () => {
    const { transport, emit } = recorder()
    mount(transport)
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined()

    emit(upTo(4))
    expect(screen.getByText("List the flow ids in this project with one Bash command, then answer in one short sentence.")).toBeDefined()
    expect(screen.getByText("The user wants flow ids listed using")).toBeDefined()
    expect(screen.getByRole("button", { name: "Stop" })).toBeDefined()

    emit(liveTurnEvents)
    expect(screen.getByText(/Two flows/)).toBeDefined()
    expect(screen.getByText("judge_panel")).toBeDefined()
    expect(screen.getByRole("button", { name: "Send" })).toBeDefined()
  })

  it("reports what the agent is doing while the turn runs and clears it when idle", () => {
    const { transport, emit } = recorder()
    mount(transport)
    expect(screen.queryByRole("status")).toBeNull()

    emit(upTo(2))
    expect(screen.getByRole("status").textContent).toContain("Thinking")

    emit(upTo(42))
    expect(screen.getByRole("status").textContent).toContain("Running a tool")

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
})
