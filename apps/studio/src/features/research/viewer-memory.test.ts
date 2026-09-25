import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as ids from "@/data/ids"
import { experimentSummary } from "./test-support"
import { GROUPING_KEY, isNewSince, markSeen, newestActivity, rememberedGrouping, rememberGrouping, seenKey, seenMarks } from "./viewer-memory"

const ROOT = "/projects/lumen"

const changedAt = (id: string, last: string | null) =>
  experimentSummary({
    id: ids.experimentId(id),
    activity: { created: null, last: last === null ? null : ids.isoDateTime(last), source: last === null ? null : "files", running: false, attention: [] },
  })

const blockStorage = (): void => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage is blocked")
  })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage is blocked")
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the grouping a viewer chose", () => {
  it("defaults to activity and comes back after a reload", () => {
    expect(rememberedGrouping()).toBe("activity")
    rememberGrouping("failureMode")
    expect(localStorage.getItem(GROUPING_KEY)).toBe("failureMode")
    expect(rememberedGrouping()).toBe("failureMode")
  })

  it("ignores a value it did not write", () => {
    localStorage.setItem(GROUPING_KEY, "alphabet")
    expect(rememberedGrouping()).toBe("activity")
  })

  it("falls back to activity when the browser refuses storage", () => {
    blockStorage()
    expect(() => {
      rememberGrouping("flow")
    }).not.toThrow()
    expect(rememberedGrouping()).toBe("activity")
  })
})

describe("the marks of what a viewer has seen", () => {
  const list = [changedAt("older", "2026-09-12T10:00:00Z"), changedAt("newer", "2026-09-20T10:00:00Z"), changedAt("untouched", null)]

  it("remembers each shown experiment and the newest activity, never moving back", () => {
    expect(newestActivity(list)).toBe("2026-09-20T10:00:00Z")
    markSeen(ROOT, list)
    const marks = seenMarks(ROOT)
    expect(marks?.visit).toBe("2026-09-20T10:00:00Z")
    expect(marks?.items.get(ids.experimentId("older"))).toBe("2026-09-12T10:00:00Z")
    markSeen(ROOT, [changedAt("older", "2026-09-10T10:00:00Z")])
    expect(seenMarks(ROOT)?.items.get(ids.experimentId("older"))).toBe("2026-09-12T10:00:00Z")
  })

  it("keeps a hidden experiment new until it has been shown", () => {
    markSeen(ROOT, [changedAt("newer", "2026-09-20T10:00:00Z")])
    const marks = seenMarks(ROOT)
    expect(isNewSince(changedAt("hidden", "2026-09-21T10:00:00Z"), marks)).toBe(true)
    expect(isNewSince(changedAt("newer", "2026-09-20T10:00:00Z"), marks)).toBe(false)
    expect(isNewSince(changedAt("newer", "2026-09-22T10:00:00Z"), marks)).toBe(true)
  })

  it("reads the older single-time mark as the visit", () => {
    localStorage.setItem(seenKey(ROOT), "2026-09-18T00:00:00Z")
    const marks = seenMarks(ROOT)
    expect(marks?.visit).toBe("2026-09-18T00:00:00Z")
    expect(isNewSince(changedAt("after", "2026-09-18T00:00:01Z"), marks)).toBe(true)
    expect(isNewSince(changedAt("same", "2026-09-18T00:00:00Z"), marks)).toBe(false)
    expect(isNewSince(changedAt("untouched", null), marks)).toBe(false)
  })

  it("keeps each project apart, shows nothing new on a first visit and ignores a value it did not write", () => {
    markSeen(ROOT, list)
    expect(seenMarks("/projects/other")).toBeNull()
    expect(isNewSince(changedAt("first_visit", "2026-09-18T00:00:01Z"), null)).toBe(false)
    localStorage.setItem(seenKey(ROOT), "yesterday-ish")
    expect(seenMarks(ROOT)).toBeNull()
  })

  it("reads no marks and writes nothing when the browser refuses storage", () => {
    blockStorage()
    expect(seenMarks(ROOT)).toBeNull()
    expect(() => {
      markSeen(ROOT, list)
    }).not.toThrow()
  })
})
