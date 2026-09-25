import { afterEach, describe, expect, it, vi } from "vitest"
import { FALLBACK_TIME_ZONE, viewerTimeZone } from "./time-zone"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("the viewer's time zone", () => {
  it("is the zone the browser reports", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...new Intl.DateTimeFormat().resolvedOptions(), timeZone: "Asia/Dubai" })
    expect(viewerTimeZone()).toBe("Asia/Dubai")
  })

  it("falls back to UTC when the browser reports none", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(() => {
      throw new Error("no zone")
    })
    expect(viewerTimeZone()).toBe(FALLBACK_TIME_ZONE)
  })
})
