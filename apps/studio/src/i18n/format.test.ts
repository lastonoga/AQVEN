import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { isoDateTime } from "@/data/ids"
import { relativeTime, useRichTags } from "./format"

const MS_PER_HOUR = 3_600_000
const HOURS_PER_DAY = 24
const FIXTURE_NOW = "2026-09-17T22:00:00.000Z"

const now = new Date(FIXTURE_NOW)
const hoursAgo = (hours: number) => isoDateTime(new Date(now.getTime() - hours * MS_PER_HOUR).toISOString())
const daysAgo = (days: number) => hoursAgo(days * HOURS_PER_DAY)

function RichTagsProbe() {
  const tags = useRichTags()
  return createElement("p", null, tags.b("bold"), tags.v("data"), tags.code("x"))
}

describe("relativeTime", () => {
  it("picks the largest whole unit", () => {
    expect(relativeTime(hoursAgo(2), now, "en", "long")).toBe("2 hours ago")
    expect(relativeTime(daysAgo(1), now, "en", "long")).toBe("yesterday")
    expect(relativeTime(daysAgo(3), now, "en", "long")).toBe("3 days ago")
    expect(relativeTime(daysAgo(7), now, "en", "long")).toBe("last week")
    expect(relativeTime(hoursAgo(0.5), now, "en", "long")).toBe("30 minutes ago")
  })

  it("supports the narrow style", () => {
    expect(relativeTime(daysAgo(3), now, "en", "narrow")).toMatch(/^3\s?d/)
  })
})

describe("useRichTags", () => {
  it("renders b, v and code tags", () => {
    const markup = renderToStaticMarkup(createElement(RichTagsProbe))
    expect(markup).toBe('<p><b class="font-semibold">bold</b><span class="normal-case tracking-normal">data</span><code class="font-mono">x</code></p>')
  })
})
