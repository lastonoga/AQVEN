import { act, render, screen, waitFor } from "@testing-library/react"
import { IntlProvider } from "use-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiChatEvent, ApiChatSession, ApiChatTranscriptPage } from "@/domain"
import { TooltipProvider } from "@/components/ui/tooltip"
import { messages } from "@/i18n/messages"
import { emptyTranscriptPage } from "./chat-history"
import { ChatSession } from "./chat-session"
import type { ChatTransport } from "./chat-transport"
import { parityFixture, type ParityJournal } from "./parity/parity-check"
import synthetic from "./parity/synthetic.json?raw"

const everyEvent = parityFixture(synthetic).journals.find((journal) => journal.name === "every-event")
const continuedTurns = parityFixture(synthetic).journals.find((journal) => journal.name === "continued-turns")

const journal = (): ParityJournal => {
  if (everyEvent === undefined) throw new Error("the parity fixture lost its every-event journal")
  return everyEvent
}

const SESSION: ApiChatSession = {
  session_id: "01a0d2db-6d3b-75ef-ac50-d495772403a9",
  backend: "claude",
  project_root: "/tmp/lumen",
  flow_id: null,
  model: null,
  permission_mode: "default",
  created_at: "2026-09-24T10:00:00Z",
  last_seq: 0,
}

class RevealingObserver implements IntersectionObserver {
  static readonly watching: RevealingObserver[] = []
  readonly root = null
  readonly rootMargin = "0px"
  readonly scrollMargin = "0px"
  readonly thresholds: readonly number[] = []
  private readonly targets: Element[] = []
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    RevealingObserver.watching.push(this)
  }

  observe(target: Element): void {
    this.targets.push(target)
  }

  unobserve(): void {
    return
  }

  disconnect(): void {
    this.targets.splice(0)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  reveal(): void {
    const entries = this.targets.map((target) => ({
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: target.getBoundingClientRect(),
      isIntersecting: true,
      rootBounds: null,
      target,
      time: 0,
    }))
    this.callback(entries, this)
  }
}

const revealTop = (): void => {
  act(() => {
    RevealingObserver.watching.at(-1)?.reveal()
  })
}

type Server = {
  readonly transport: ChatTransport
  readonly requested: (number | null)[]
  readonly emit: (events: readonly ApiChatEvent[]) => void
}

const server = (pages: readonly ApiChatTranscriptPage[], newest: ApiChatTranscriptPage): Server => {
  const requested: (number | null)[] = []
  const listeners: ((event: ApiChatEvent) => void)[] = []
  const transport: ChatTransport = {
    open: (_sessionId, onPage, onEvent) => {
      requested.push(null)
      onPage(newest)
      listeners.push(onEvent)
      return () => {
        listeners.splice(listeners.indexOf(onEvent), 1)
      }
    },
    transcript: (sessionId, beforeSeq) => {
      requested.push(beforeSeq)
      const older = pages.find((page) => page.turns.some((turn) => turn.last_seq === beforeSeq - 1))
      return Promise.resolve(older ?? emptyTranscriptPage(sessionId))
    },
    send: () => Promise.resolve(),
    respond: () => Promise.resolve(),
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
  return { transport, requested, emit }
}

const mount = (transport: ChatTransport): HTMLElement =>
  render(
    <IntlProvider locale="en" messages={messages.en} timeZone="UTC">
      <TooltipProvider>
        <ChatSession session={SESSION} transport={transport} />
      </TooltipProvider>
    </IntlProvider>,
  ).container

const lastCut = () => {
  const cut = journal().cuts.at(-1)
  if (cut === undefined) throw new Error("the every-event journal has no cuts")
  return cut
}

const newestOf = (pages: readonly ApiChatTranscriptPage[]): ApiChatTranscriptPage => {
  const newest = pages[0]
  if (newest === undefined) throw new Error("a cut without pages")
  return newest
}

const loadEverything = async (requested: readonly unknown[], count: number): Promise<void> => {
  for (let loaded = 1; loaded < count; loaded += 1) {
    revealTop()
    await waitFor(() => {
      expect(requested.length).toBe(loaded + 1)
    })
    await waitFor(() => {
      expect(RevealingObserver.watching.length).toBe(Math.min(loaded + 1, count - 1))
    })
  }
}

const GENERATED_IDS = / (id|aria-controls)="radix-[^"]*"/g

const messageList = (container: HTMLElement): string =>
  (container.querySelector(".flex.flex-col.gap-4")?.innerHTML ?? "").replace(GENERATED_IDS, "")

beforeEach(() => {
  RevealingObserver.watching.splice(0)
  vi.stubGlobal("IntersectionObserver", RevealingObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("a reloaded chat", () => {
  it("opens on the newest folded turn and keeps following the live tail", () => {
    const cut = journal().cuts.find((candidate) => candidate.at_seq === 64)
    if (cut === undefined) throw new Error("the every-event journal lost its mid-turn cut")
    const { transport, emit } = server(cut.pages, newestOf(cut.pages))
    mount(transport)
    expect(screen.getByText("Keep going.")).toBeDefined()
    expect(screen.queryByText("List the flows and check one.")).toBeNull()

    emit(journal().events.filter((event) => event.seq > cut.at_seq))
    expect(screen.getByText("Half an ans")).toBeDefined()
  })

  it("loads earlier turns as the top comes into view, without a button to press", async () => {
    const cut = lastCut()
    const { transport, requested } = server(cut.pages, newestOf(cut.pages))
    mount(transport)
    expect(screen.queryByRole("button", { name: /earlier|more/i })).toBeNull()

    await loadEverything(requested, cut.pages.length)

    await screen.findByText("List the flows and check one.")
    expect(requested).toEqual([null, ...cut.pages.slice(0, -1).map((page) => page.before_seq)])
  })

  it("renders the same thread as a replay of every event once all turns are loaded", async () => {
    const cut = lastCut()
    const replay = server([], emptyTranscriptPage(SESSION.session_id))
    const replayed = mount(replay.transport)
    replay.emit(journal().events)
    const expected = messageList(replayed)

    const reloaded = server(cut.pages, newestOf(cut.pages))
    const hydrated = mount(reloaded.transport)
    await loadEverything(reloaded.requested, cut.pages.length)
    await waitFor(() => {
      expect(messageList(hydrated)).toEqual(expected)
    })
  })

  it("marks a turn the agent opened on its own instead of showing an empty message from you", () => {
    if (continuedTurns === undefined) throw new Error("the parity fixture lost its continued-turns journal")
    const replay = server([], emptyTranscriptPage(SESSION.session_id))
    const container = mount(replay.transport)
    replay.emit(continuedTurns.events)

    expect(screen.getByText("The agent continued on its own")).toBeDefined()
    expect(screen.getByText("The build passed.")).toBeDefined()
    expect(container.querySelectorAll('[data-slot="continuation-note"]')).toHaveLength(1)
  })
})
