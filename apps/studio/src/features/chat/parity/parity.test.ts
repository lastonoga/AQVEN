import { describe, expect, it } from "vitest"
import { CHAT_EVENT_TYPES } from "../chat-events"
import ownerJournal from "./owner-journal.json?raw"
import { parityFixture, parityReport, type ParityJournal } from "./parity-check"
import synthetic from "./synthetic.json?raw"

const fixture = parityFixture(synthetic)
const report = parityReport(fixture)
const owner = parityFixture(ownerJournal)
const ownerReport = parityReport(owner)

const cutCount = (journals: readonly ParityJournal[]): number => journals.reduce((total, journal) => total + journal.cuts.length, 0)

describe("a chat rebuilt from folded turns and the live tail", () => {
  it("is checked against journals that hold every event type", () => {
    const seen = new Set(fixture.journals.flatMap((journal) => journal.events.map((event) => event.type)))
    expect([...seen].sort()).toEqual([...CHAT_EVENT_TYPES].sort())
    expect(report.complete.length).toBe(cutCount(fixture.journals))
  })

  it.each(report.windows)("$label shows the same items as a full replay", ({ expected, actual }) => {
    expect(actual).toEqual(expected)
  })

  it.each(report.complete)("$label equal a full replay item for item", ({ expected, actual }) => {
    expect(actual).toEqual(expected)
  })
})

describe("the owner's journal rebuilt from folded turns and the live tail", () => {
  it("walks at least one page at every cut", () => {
    expect(owner.journals.every((journal) => journal.cuts.every((cut) => cut.pages.length > 0))).toBe(true)
    expect(ownerReport.complete.length).toBe(cutCount(owner.journals))
  })

  it.each(ownerReport.windows)("$label shows the same items as a full replay", ({ expected, actual }) => {
    expect(actual).toEqual(expected)
  })

  it.each(ownerReport.complete)("$label equal a full replay item for item", ({ expected, actual }) => {
    expect(actual).toEqual(expected)
  })
})
