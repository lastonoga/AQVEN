import { describe, expect, it } from "vitest"
import {
  addressLabel,
  deadlineDotLabel,
  deadlineDuration,
  deadlineState,
  detailMeta,
  entryKey,
  entryReason,
  entryTitle,
  nextEntry,
  timeoutSummary,
  waitBadge,
  type ReviewEntry,
} from "./presenters"
import { approvalEntry, approvalWait, copy, formEntry, formWait, NOW } from "./test-support"

describe("deadlineState", () => {
  it("counts the minutes left before the deadline", () => {
    expect(deadlineState(formWait, NOW)).toEqual({ kind: "onTrack", minutes: 212 })
    expect(deadlineDuration(deadlineState(formWait, NOW), copy.t)).toBe("3 h 32 m left")
    expect(deadlineDotLabel(deadlineState(formWait, NOW), copy.t)).toEqual({})
  })

  it("counts the minutes past a missed deadline", () => {
    expect(deadlineState(approvalWait, NOW)).toEqual({ kind: "overdue", minutes: 79 })
    expect(deadlineDuration(deadlineState(approvalWait, NOW), copy.t)).toBe("overdue 1 h 19 m")
    expect(deadlineDotLabel(deadlineState(approvalWait, NOW), copy.t)).toEqual({ label: "past the deadline" })
  })

  it("treats the deadline itself as on track", () => {
    expect(deadlineState(formWait, new Date(formWait.deadline_at))).toEqual({ kind: "onTrack", minutes: 0 })
  })
})

describe("queue copy", () => {
  it("names the address with its branch", () => {
    expect(addressLabel(approvalWait.address)).toBe("route__resolve · defect")
    expect(addressLabel({ node_id: "record__extract", branch_key: null, iteration: 2, item_index: 3 })).toBe("record__extract · #2 · [3]")
  })

  it("titles an entry by its run and explains why it waits", () => {
    expect(entryTitle(formEntry, copy.t)).toBe("run #234778")
    expect(entryReason(formEntry, copy)).toBe("form · assigned to support_lead")
    expect(entryReason(approvalEntry, copy)).toBe("tool approval · assigned to support_lead")
    expect(waitBadge(approvalWait, copy.domain)).toBe("tool approval")
  })

  it("summarises the attempt and the timeout policy", () => {
    expect(detailMeta(approvalEntry, copy.t)).toBe("run #b56d92 · attempt 3 · ToolApprovalAnswer")
    expect(timeoutSummary(formWait, deadlineState(formWait, NOW), copy)).toBe("3 h 32 m left · on timeout: escalate")
  })
})

describe("queue order", () => {
  const queue: readonly ReviewEntry[] = [approvalEntry, formEntry]

  it("keys an entry by run and address", () => {
    expect(entryKey(approvalEntry)).toBe("01a0b104-4658-70aa-b49b-7c2586b56d92|route__resolve · defect")
  })

  it("finds the entry after the answered one", () => {
    expect(nextEntry(queue, entryKey(approvalEntry))).toBe(formEntry)
    expect(nextEntry(queue, entryKey(formEntry))).toBeNull()
    expect(nextEntry(queue, "missing")).toBeNull()
  })
})
