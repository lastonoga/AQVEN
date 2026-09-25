import { useEffect } from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_BASE } from "@/api/client"
import { server } from "@/mocks/node"
import { renderRoute } from "@/test/render-route"

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))

function ChatPanelDouble() {
  useEffect(() => {
    lifecycle.mounts += 1
    return () => {
      lifecycle.unmounts += 1
    }
  }, [])
  return <textarea aria-label="Chat draft" />
}

vi.mock("@/features/chat", () => ({
  ChatPanel: ChatPanelDouble,
}))

const ROUTE = "/research"
const VISIBILITY_KEY = "aqven:chat:panel"
const WIDTH_KEY = "split-pane:shell:chat"
const GROUP_WIDTH = 1200
const EMPTY_FLOWS = { items: [], next_cursor: null, total_estimate: 0 }

const layoutWidth = (element: HTMLElement): number => {
  if (!element.hasAttribute("data-panel")) return 0
  const grow = element.style.flexGrow
  if (grow === "") return Number.parseFloat(element.style.flexBasis) || 0
  if (grow === "1" && element.id === "workspace") return GROUP_WIDTH - layoutWidth(chatPanel())
  return (Number(grow) / 100) * GROUP_WIDTH
}

const layoutLeft = (element: HTMLElement): number => {
  if (element.id === "chat") return 0
  if (!element.hasAttribute("data-panel") && !element.hasAttribute("data-separator")) return 0
  return layoutWidth(chatPanel())
}

const chatPanel = (): HTMLElement => {
  const panel = document.getElementById("chat")
  if (panel === null) throw new Error("the chat panel is not rendered")
  return panel
}

const observers = new Set<RecordingResizeObserver>()

class RecordingResizeObserver {
  private readonly targets = new Set<Element>()
  private readonly callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observers.add(this)
  }
  observe(target: Element): void {
    this.targets.add(target)
  }
  unobserve(target: Element): void {
    this.targets.delete(target)
  }
  disconnect(): void {
    this.targets.clear()
    observers.delete(this)
  }
  flush(): void {
    this.callback([...this.targets].map(entryOf), this)
  }
}

const sizeOf = (target: Element): ResizeObserverSize => ({ inlineSize: target instanceof HTMLElement ? target.offsetWidth : 0, blockSize: 0 })

const rectOf = (target: Element): DOMRectReadOnly => {
  const width = sizeOf(target).inlineSize
  return { x: 0, y: 0, width, height: 0, top: 0, left: 0, right: width, bottom: 0, toJSON: () => ({}) }
}

const entryOf = (target: Element): ResizeObserverEntry => ({
  target,
  borderBoxSize: [sizeOf(target)],
  contentBoxSize: [sizeOf(target)],
  devicePixelContentBoxSize: [sizeOf(target)],
  contentRect: rectOf(target),
})

const flushResizes = (): void => {
  act(() => {
    observers.forEach((observer) => {
      observer.flush()
    })
  })
}

const draftBox = (): HTMLTextAreaElement => {
  const box = screen.getByRole("textbox", { name: "Chat draft" })
  if (!(box instanceof HTMLTextAreaElement)) throw new Error("the chat draft is not a textarea")
  return box
}

const chatWidth = (): number => Math.round(layoutWidth(chatPanel()))

const toggle = (name: "Hide chat" | "Show chat"): Promise<HTMLElement> => screen.findByRole("button", { name })

const expectOpen = (button: HTMLElement): void => {
  expect(button.getAttribute("aria-expanded")).toBe("true")
  expect(chatPanel().hasAttribute("inert")).toBe(false)
  expect(screen.getByRole("separator", { name: "Resize chat" })).toBeTruthy()
}

const expectClosed = (button: HTMLElement): void => {
  expect(button.getAttribute("aria-expanded")).toBe("false")
  expect(chatPanel().hasAttribute("inert")).toBe(true)
  expect(chatWidth()).toBe(0)
  expect(screen.queryByRole("separator", { name: "Resize chat" })).toBeNull()
}

beforeEach(() => {
  localStorage.clear()
  lifecycle.mounts = 0
  lifecycle.unmounts = 0
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return layoutWidth(this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return layoutLeft(this)
    },
  })
})

afterEach(() => {
  observers.clear()
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
  Reflect.deleteProperty(HTMLElement.prototype, "offsetLeft")
  vi.restoreAllMocks()
})

describe("Chat toggle", () => {
  it("sits left of the project name and hides and shows the chat panel", async () => {
    await renderRoute(ROUTE)
    const hide = await toggle("Hide chat")
    expect(hide.getAttribute("aria-controls")).toBe("chat")
    const crumbs = screen.getByRole("navigation", { name: "Project" })
    expect(hide.compareDocumentPosition(crumbs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expectOpen(hide)
    expect(chatWidth()).toBe(352)
    fireEvent.click(hide)
    expectClosed(await toggle("Show chat"))
    fireEvent.click(await toggle("Show chat"))
    expectOpen(await toggle("Hide chat"))
  })

  it("brings the chat back at the width it had before closing", async () => {
    localStorage.setItem(WIDTH_KEY, "420")
    await renderRoute(ROUTE)
    await toggle("Hide chat")
    expect(chatWidth()).toBe(420)
    fireEvent.click(await toggle("Hide chat"))
    expect(chatWidth()).toBe(0)
    fireEvent.click(await toggle("Show chat"))
    await toggle("Hide chat")
    expect(chatWidth()).toBe(420)
    expect(localStorage.getItem(WIDTH_KEY)).toBe("420")
  })

  it("remembers the choice for the viewer", async () => {
    await renderRoute(ROUTE)
    fireEvent.click(await toggle("Hide chat"))
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe("closed")
    fireEvent.click(await toggle("Show chat"))
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe("open")
  })

  it("starts hidden when the viewer left it hidden", async () => {
    localStorage.setItem(VISIBILITY_KEY, "closed")
    localStorage.setItem(WIDTH_KEY, "400")
    await renderRoute(ROUTE)
    expectClosed(await toggle("Show chat"))
    fireEvent.click(await toggle("Show chat"))
    expectOpen(await toggle("Hide chat"))
    expect(chatWidth()).toBe(400)
  })

  it("works without browser storage and starts open", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })
    await renderRoute(ROUTE)
    expectOpen(await toggle("Hide chat"))
    fireEvent.click(await toggle("Hide chat"))
    expectClosed(await toggle("Show chat"))
    fireEvent.click(await toggle("Show chat"))
    expectOpen(await toggle("Hide chat"))
  })

  it("keeps the chat mounted with its draft while hidden", async () => {
    await renderRoute(ROUTE)
    const draft = draftBox()
    fireEvent.change(draft, { target: { value: "half-written question" } })
    fireEvent.click(await toggle("Hide chat"))
    await toggle("Show chat")
    expect(chatPanel().contains(draft)).toBe(true)
    fireEvent.click(await toggle("Show chat"))
    await toggle("Hide chat")
    expect(draftBox()).toBe(draft)
    expect(draft.value).toBe("half-written question")
    expect(lifecycle).toEqual({ mounts: 1, unmounts: 0 })
  })

  it("follows the chat when it is closed from its resize handle", async () => {
    vi.stubGlobal("ResizeObserver", RecordingResizeObserver)
    await renderRoute(ROUTE)
    await toggle("Hide chat")
    flushResizes()
    const separator = screen.getByRole("separator", { name: "Resize chat" })
    fireEvent.keyDown(separator, { key: "Enter" })
    flushResizes()
    expectClosed(await toggle("Show chat"))
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe("closed")
    fireEvent.click(await toggle("Show chat"))
    flushResizes()
    expectOpen(await toggle("Hide chat"))
    expect(chatWidth()).toBe(352)
  })

  it("reveals a hidden chat when a page hands work to it", async () => {
    localStorage.setItem(VISIBILITY_KEY, "closed")
    server.use(
      http.get(`${API_BASE}/flows`, () => HttpResponse.json(EMPTY_FLOWS)),
      http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, () =>
        HttpResponse.json({ turn_id: "turn-1", accepted_at: "2026-09-18T03:00:00Z" }, { status: 202 }),
      ),
    )
    await renderRoute("/")
    expectClosed(await toggle("Show chat"))
    const ask = await screen.findByRole("button", { name: "Ask the agent to write a flow" })
    await waitFor(() => {
      expect(ask.hasAttribute("disabled")).toBe(false)
    })
    fireEvent.click(ask)
    expectOpen(await toggle("Hide chat"))
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe("open")
  })
})
