import { describe, expect, it } from "vitest"
import { isoDateTime, reviewId } from "@/data/ids"
import {
  SLA,
  decisionHint,
  decisionLabel,
  detailMeta,
  nextItemId,
  queueReason,
  runTitle,
  slaDotLabel,
  slaDuration,
  slaState,
  slaSummary,
  stageNode,
  triggerBadge,
} from "./presenters"
import { NOW, copy, pitchQueue, queueItem, reviewDetail } from "./test-support"

const { t } = copy

describe("slaState", () => {
  it("counts the minutes left before the due time", () => {
    expect(slaState(queueItem(0).sla, NOW)).toEqual({ kind: "onTrack", remainingMinutes: 192 })
  })

  it("turns into overdue once the due time has passed", () => {
    expect(slaState(queueItem(2).sla, NOW)).toEqual({ kind: "overdue", overdueMinutes: 65 })
  })

  it("stays on track exactly at the due time", () => {
    expect(slaState({ budgetMinutes: 60, dueAt: isoDateTime(NOW.toISOString()) }, NOW)).toEqual({ kind: "onTrack", remainingMinutes: 0 })
  })
})

describe("SLA tones", () => {
  it("keeps the queue text muted while on track and destructive when overdue", () => {
    expect(SLA.onTrack).toEqual({ dot: "warning", queue: "neutral", detail: "warning" })
    expect(SLA.overdue).toEqual({ dot: "destructive", queue: "destructive", detail: "destructive" })
  })
})

describe("slaDotLabel", () => {
  it("names only the overdue dot for screen readers", () => {
    expect(slaDotLabel(slaState(queueItem(0).sla, NOW), t)).toEqual({})
    expect(slaDotLabel(slaState(queueItem(2).sla, NOW), t)).toEqual({ label: "overdue" })
  })
})

describe("decisionLabel", () => {
  it.each([
    ["approve", "Approve · resume run"],
    ["changes", "Request changes"],
    ["reject", "Reject branch"],
  ] as const)("labels the %s decision", (decision, label) => {
    expect(decisionLabel(decision, t)).toBe(label)
  })
})

describe("queue card lines", () => {
  it.each([
    [0, "run #8247", "3 h 12 m left", "stage 7 · decide_pitch", "needs_human · verdict ≠ approved"],
    [1, "run #8244", "8 h 40 m left", "stage 4 · pitch_gen_d", "human input · brief addition"],
    [2, "run #8236", "overdue 1 h 05 m", "stage 7 · decide_pitch", "escalated · SLA breached"],
  ])("renders item %i from the mock backend", (index, title, sla, stage, reason) => {
    const item = queueItem(index)
    expect(runTitle(item, t)).toBe(title)
    expect(slaDuration(slaState(item.sla, NOW), t)).toBe(sla)
    expect(stageNode(item, t)).toBe(stage)
    expect(queueReason(item, t)).toBe(reason)
  })
})

describe("detail header", () => {
  it("renders the designed header of run #8247", () => {
    const item = queueItem(0)
    expect(triggerBadge(item, t)).toBe("NEEDS HUMAN")
    expect(detailMeta(item, reviewDetail(item), t)).toBe("run #8247 · stage 7 · row #07 · branch b")
    expect(slaSummary(item.sla, slaState(item.sla, NOW), copy)).toBe("SLA 4 h · 3 h 12 m left · then escalate")
    expect(decisionHint(item, t)).toBe("approve resumes stage 7 with this branch · request changes replays the loop with your note")
  })

  it("drops the budget when the step has none", () => {
    const item = queueItem(1)
    expect(triggerBadge(item, t)).toBe("NEEDS INPUT")
    expect(slaSummary(item.sla, slaState(item.sla, NOW), copy)).toBe("8 h 40 m left · then escalate")
  })

  it("says the step has escalated once overdue", () => {
    const item = queueItem(2)
    expect(slaSummary(item.sla, slaState(item.sla, NOW), copy)).toBe("SLA 4 h · overdue 1 h 05 m · escalated")
  })

  it("keeps minutes in a budget that is not a whole number of hours", () => {
    const sla = { budgetMinutes: 90, dueAt: isoDateTime("2026-09-16T12:30:00Z") }
    expect(slaSummary(sla, slaState(sla, NOW), copy)).toBe("SLA 1 h 30 m · 0 h 30 m left · then escalate")
  })
})

describe("nextItemId", () => {
  it("selects the following queue item", () => {
    expect(nextItemId(pitchQueue, queueItem(0).id)).toBe(queueItem(1).id)
  })

  it("has no next item after the last one or for an unknown id", () => {
    expect(nextItemId(pitchQueue, queueItem(2).id)).toBeNull()
    expect(nextItemId(pitchQueue, reviewId("unknown"))).toBeNull()
  })
})
