import { afterEach, describe, expect, it, vi } from "vitest"
import { readMessage, subscribeEvents } from "./sse"

type Listener = (message: Event) => void

class FakeSource {
  static last: FakeSource | null = null
  readonly url: string
  readonly listeners = new Map<string, Listener>()
  closed = false

  constructor(url: string) {
    this.url = url
    FakeSource.last = this
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener)
  }

  close(): void {
    this.closed = true
  }
}

const numberOf = (value: unknown): number | null => (typeof value === "number" ? value : null)

afterEach(() => {
  vi.unstubAllGlobals()
  FakeSource.last = null
})

describe("server-sent events", () => {
  it("reads the JSON data of a message and drops what is not JSON", () => {
    expect(readMessage(new MessageEvent("x", { data: "7" }), numberOf)).toBe(7)
    expect(readMessage(new MessageEvent("x", { data: "{" }), numberOf)).toBeNull()
    expect(readMessage(new Event("x"), numberOf)).toBeNull()
  })

  it("listens to the named events, hands on what it reads and closes the source", () => {
    vi.stubGlobal("EventSource", FakeSource)
    const received: number[] = []
    const close = subscribeEvents({ url: "/api/series/s1/events", types: ["series_status", "series_finished"], read: numberOf, onEvent: (value) => received.push(value) })
    const source = FakeSource.last
    expect(source?.url).toBe("/api/series/s1/events")
    expect([...(source?.listeners.keys() ?? [])]).toEqual(["series_status", "series_finished"])
    source?.listeners.get("series_status")?.(new MessageEvent("series_status", { data: "1" }))
    source?.listeners.get("series_finished")?.(new MessageEvent("series_finished", { data: "\"done\"" }))
    expect(received).toEqual([1])
    close()
    expect(source?.closed).toBe(true)
  })

  it("does nothing without EventSource", () => {
    vi.stubGlobal("EventSource", undefined)
    const close = subscribeEvents({ url: "/x", types: ["a"], read: numberOf, onEvent: () => undefined })
    expect(close).toBeTypeOf("function")
    expect(FakeSource.last).toBeNull()
  })
})
