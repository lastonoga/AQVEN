import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiRunEvent, RunStatus } from "@/domain"
import * as ids from "@/data/ids"
import {
  emptyOverlay,
  eventSourceStream,
  isLiveStatus,
  isRunEvent,
  lastSeqOf,
  mergeBlobs,
  mergeEvents,
  mergeLive,
  RUN_EVENT_EFFECT,
  runEventsUrl,
} from "./run-events"
import { completedSnapshot, FakeEventSource, nodeFinished, outputDelta, runFinished } from "./test-support"

const RUN = "run-1"

describe("run event helpers", () => {
  it("follows only runs that can still change", () => {
    const live: readonly RunStatus[] = ["queued", "running", "suspended"]
    const settled: readonly RunStatus[] = ["completed", "failed", "cancelled"]
    live.forEach((status) => { expect(isLiveStatus(status)).toBe(true) })
    settled.forEach((status) => { expect(isLiveStatus(status)).toBe(false) })
  })

  it("refreshes the snapshot on structural events and stops on the final one", () => {
    expect(RUN_EVENT_EFFECT.node_output_delta).toBe("append")
    expect(RUN_EVENT_EFFECT.node_finished).toBe("refresh")
    expect(RUN_EVENT_EFFECT.run_finished).toBe("finish")
  })

  it("accepts only known run events", () => {
    expect(isRunEvent(nodeFinished(RUN, 1, "prepare"))).toBe(true)
    expect(isRunEvent({ seq: 1, run_id: RUN, type: "chat_message" })).toBe(false)
    expect(isRunEvent({ seq: "1", run_id: RUN, type: "node_finished" })).toBe(false)
    expect(isRunEvent(null)).toBe(false)
  })

  it("builds the stream url after the last known event", () => {
    expect(runEventsUrl(ids.runId("a/b"), 7)).toBe("/api/runs/a%2Fb/events?after_seq=7")
  })

  it("merges events by sequence without duplicates", () => {
    const first = nodeFinished(RUN, 1, "prepare")
    const second = outputDelta(RUN, 2, "triage", "he")
    const third = outputDelta(RUN, 3, "triage", "llo")
    const base: readonly ApiRunEvent[] = [first, second]
    expect(mergeEvents(base, [])).toBe(base)
    expect(mergeEvents(base, [second])).toBe(base)
    expect(mergeEvents(base, [third, second]).map((event) => event.seq)).toEqual([1, 2, 3])
  })

  it("adds blobs that are not known yet", () => {
    const base = [{ blobId: "a", text: "1" }]
    expect(mergeBlobs(base, [{ blobId: "a", text: "2" }])).toBe(base)
    expect(mergeBlobs(base, [{ blobId: "b", text: "3" }]).map((blob) => blob.blobId)).toEqual(["a", "b"])
  })

  it("prefers the newer snapshot and ignores an overlay of another run", () => {
    const snapshot = completedSnapshot()
    const newer = { ...snapshot, status: "failed" as const, last_seq: snapshot.last_seq + 5 }
    const base = { snapshot, events: [], blobs: [] }
    const overlay = { ...emptyOverlay(snapshot.run_id), snapshot: newer, events: [runFinished(snapshot.run_id, snapshot.last_seq + 5)] }
    const merged = mergeLive(base, overlay)
    expect(merged.snapshot.status).toBe("failed")
    expect(merged.events).toHaveLength(1)
    expect(mergeLive(base, { ...overlay, runId: "another" })).toBe(base)
    expect(mergeLive({ ...base, snapshot: newer }, { ...overlay, snapshot })).toMatchObject({ snapshot: newer })
  })

  it("starts after the highest sequence of the snapshot and the events", () => {
    const snapshot = { ...completedSnapshot(), last_seq: 4 }
    expect(lastSeqOf(snapshot, [])).toBe(4)
    expect(lastSeqOf(snapshot, [outputDelta(RUN, 9, "triage", "x")])).toBe(9)
  })
})

describe("eventSourceStream", () => {
  beforeEach(() => {
    FakeEventSource.reset()
    vi.stubGlobal("EventSource", FakeEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("delivers the events of the run and closes on unsubscribe", () => {
    const received: ApiRunEvent[] = []
    const close = eventSourceStream(ids.runId(RUN), 3, (event) => { received.push(event) })
    const source = FakeEventSource.latest()
    expect(source.url).toBe(`/api/runs/${RUN}/events?after_seq=3`)
    source.emit(nodeFinished(RUN, 4, "prepare"))
    source.emit(nodeFinished("another-run", 5, "prepare"))
    expect(received.map((event) => event.seq)).toEqual([4])
    close()
    expect(source.closed).toBe(true)
  })
})
