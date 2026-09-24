import { act, render, screen } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ApiChatEvent, ApiChatSession } from "@/domain"
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

const MARKDOWN = "The package is **lumen**.\n\n- reads `aqven.yaml`\n- runs [the flow](https://example.test)\n\n```python\nprint(1)\n```\n"

const events: readonly ApiChatEvent[] = [
  {
    seq: 1,
    at: "2026-09-17T21:55:49.907456Z",
    session_id: SESSION.session_id,
    turn_id: "turn-1",
    type: "chat_turn_started",
    client_op_id: "op-1",
    text: "what is the package?",
    backend: "claude",
    model: null,
    origin: "user",
  },
  {
    seq: 2,
    at: "2026-09-17T21:55:50.907456Z",
    session_id: SESSION.session_id,
    turn_id: "turn-1",
    type: "chat_text_delta",
    message_id: "msg-1",
    part_index: 0,
    delta: MARKDOWN,
  },
  { seq: 3, at: "2026-09-17T21:55:51.907456Z", session_id: SESSION.session_id, turn_id: "turn-1", type: "chat_status", state: "idle" },
]

const mount = (): ((events: readonly ApiChatEvent[]) => void) => {
  const listeners: ((event: ApiChatEvent) => void)[] = []
  const transport: ChatTransport = {
    ...liveOnly(listeners),
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
  return (batch) => {
    act(() => {
      batch.forEach((event) => {
        listeners.forEach((listener) => {
          listener(event)
        })
      })
    })
  }
}

describe("assistant markdown", () => {
  it("renders emphasis, lists, links and code fences instead of raw markup", async () => {
    const emit = mount()
    emit(events)
    const bold = await screen.findByText("lumen")
    expect(bold.tagName).toBe("STRONG")
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText("aqven.yaml").tagName).toBe("CODE")
    expect(screen.getByRole("link", { name: "the flow" }).getAttribute("href")).toBe("https://example.test")
    expect(screen.getByText(/print\(1\)/).closest("pre")).toBeDefined()
    expect(screen.queryByText(/\*\*lumen\*\*/)).toBeNull()
  })
})
