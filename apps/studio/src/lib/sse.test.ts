import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FakeEventStream } from "@/test/event-source"
import { createEventMux, followUrl, type FollowFeed, type Unsubscribe } from "./sse"

const URL = "/api/events"
const RETRY_MS = 1000

type Seen = { readonly seq: number }

const seenOf = (value: unknown): Seen | null => {
  const seq = typeof value === "object" && value !== null && "seq" in value ? value.seq : null
  return typeof seq === "number" ? { seq } : null
}

const settle = async (): Promise<void> => {
  await Promise.resolve()
}

const collect = (follow: FollowFeed, feed: string, after: number): { readonly seqs: number[]; readonly stop: Unsubscribe } => {
  const seqs: number[] = []
  const stop = follow({ feed, after, read: seenOf, onEvent: (event) => seqs.push(event.seq) })
  return { seqs, stop }
}

const openSources = (): readonly FakeEventStream[] => FakeEventStream.opened.filter((source) => !source.closed)

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("one event stream per tab", () => {
  beforeEach(() => {
    FakeEventStream.reset()
    vi.stubGlobal("EventSource", FakeEventStream)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setVisibility("visible")
  })

  it("follows the project, a run and a chat session over a single EventSource", async () => {
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const spec = collect(follow, "spec", 0)
    const run = collect(follow, "run:r1", 3)
    const chat = collect(follow, "chat:c1", 7)
    await settle()

    expect(FakeEventStream.opened).toHaveLength(1)
    expect(FakeEventStream.opened[0]?.url).toBe(`${URL}?follow=spec%400&follow=run%3Ar1%403&follow=chat%3Ac1%407`)
    FakeEventStream.latestOn(URL).emit("run:r1", { seq: 4 })
    FakeEventStream.latestOn(URL).emit("spec", { seq: 1 })
    expect(run.seqs).toEqual([4])
    expect(spec.seqs).toEqual([1])
    expect(chat.seqs).toEqual([])

    spec.stop()
    run.stop()
    chat.stop()
    await settle()
    expect(openSources()).toHaveLength(0)
  })

  it("reopens from the cursors it has seen when a feed joins or leaves", async () => {
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const spec = collect(follow, "spec", 0)
    await settle()
    const first = FakeEventStream.latestOn(URL)
    first.emit("spec", { seq: 5 })

    const run = collect(follow, "run:r1", 2)
    await settle()
    expect(first.closed).toBe(true)
    expect(openSources().map((source) => source.url)).toEqual([followUrl(URL, new Map([["spec", 5], ["run:r1", 2]]))])

    FakeEventStream.latestOn(URL).emit("run:r1", { seq: 9 })
    run.stop()
    await settle()
    expect(openSources().map((source) => source.url)).toEqual([followUrl(URL, new Map([["spec", 5]]))])

    spec.stop()
    await settle()
    expect(openSources()).toHaveLength(0)
    expect(run.seqs).toEqual([9])
  })

  it("shares a feed between subscribers without reconnecting", async () => {
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const first = collect(follow, "spec", 0)
    await settle()
    const second = collect(follow, "spec", 0)
    await settle()
    FakeEventStream.latestOn(URL).emit("spec", { seq: 1 })
    first.stop()
    await settle()
    FakeEventStream.latestOn(URL).emit("spec", { seq: 2 })

    expect(FakeEventStream.opened).toHaveLength(1)
    expect(first.seqs).toEqual([1])
    expect(second.seqs).toEqual([1, 2])
    second.stop()
  })

  it("retries after an error from the last cursors instead of the first ones", async () => {
    vi.useFakeTimers()
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const spec = collect(follow, "spec", 0)
    await settle()
    const broken = FakeEventStream.latestOn(URL)
    broken.emit("spec", { seq: 3 })
    broken.emit("error", null)

    expect(broken.closed).toBe(true)
    expect(openSources()).toHaveLength(0)
    vi.advanceTimersByTime(RETRY_MS)
    expect(openSources().map((source) => source.url)).toEqual([followUrl(URL, new Map([["spec", 3]]))])
    spec.stop()
  })

  it("lets go of the connection while the tab is hidden and resumes when it is shown", async () => {
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const spec = collect(follow, "spec", 0)
    await settle()
    FakeEventStream.latestOn(URL).emit("spec", { seq: 4 })

    setVisibility("hidden")
    await settle()
    expect(openSources()).toHaveLength(0)

    setVisibility("visible")
    await settle()
    expect(openSources().map((source) => source.url)).toEqual([followUrl(URL, new Map([["spec", 4]]))])
    spec.stop()
  })

  it("does nothing without EventSource", async () => {
    vi.stubGlobal("EventSource", undefined)
    const follow = createEventMux({ url: URL, retryMs: RETRY_MS })
    const spec = collect(follow, "spec", 0)
    await settle()
    expect(FakeEventStream.opened).toHaveLength(0)
    spec.stop()
  })
})
