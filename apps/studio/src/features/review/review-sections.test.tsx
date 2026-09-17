import { render } from "@testing-library/react"
import type { RichTagsFunction } from "use-intl"
import { describe, expect, it } from "vitest"
import type { ReviewQueueItem } from "@/domain"
import { REVIEW_SECTIONS, reviewEvidence, type ReviewEvidence } from "./review-sections"
import { copy, queueItem, reviewDetail } from "./test-support"

const strong: RichTagsFunction = (chunks) => <b>{chunks}</b>

const evidenceOf = (item: ReviewQueueItem): readonly ReviewEvidence[] => reviewEvidence(reviewDetail(item), item, { ...copy, strong })

const sectionAt = (sections: readonly ReviewEvidence[], index: number): ReviewEvidence => {
  const section = sections[index]
  if (section === undefined) throw new Error(`No section at ${String(index)}`)
  return section
}

const noteText = (section: ReviewEvidence): readonly (string | null)[] =>
  section.note.lines.map((line) => render(<p>{line.content}</p>).container.textContent)

describe("REVIEW_SECTIONS", () => {
  it("builds the produced and why columns in design order", () => {
    const sections = evidenceOf(queueItem(0))
    expect(REVIEW_SECTIONS).toHaveLength(2)
    expect(sections.map((section) => [section.id, section.title])).toEqual([
      ["produced", "What the run produced"],
      ["why", "Why a human was asked"],
    ])
  })

  it("renders what run #8247 produced", () => {
    const produced = sectionAt(evidenceOf(queueItem(0)), 0)
    expect(produced.note).toMatchObject({ variant: "well", tone: "neutral" })
    expect(noteText(produced)).toEqual(["“Park, spa and quiet”", "12 ha park · 1,200 m² spa · third hook empty"])
    expect(produced.rows).toEqual([
      { key: "agent", value: "pitch_gen_b · gpt-5.1 · t 0.9" },
      { key: "prompt", value: "pitch_v7 · r42" },
      { key: "cost", value: "$0.0611 · 7.3 s" },
      { key: "post-check", value: [{ glyph: "cross", text: "hooks[*] non-empty" }] },
    ])
  })

  it("renders why a human was asked for run #8247", () => {
    const why = sectionAt(evidenceOf(queueItem(0)), 1)
    expect(why.note).toMatchObject({ variant: "callout", tone: "warning" })
    expect(noteText(why)).toEqual([
      "Judges returned needs_human: facts pass, tone passes, but the third hook is empty and the loop stopped on stagnation at 0.814 — below threshold 0.90.",
    ])
    expect(why.rows).toEqual([
      { key: "judges", value: "style 0.83 · facts 0.88 · tone 0.80" },
      { key: "loop", value: "4 iterations · stop: stagnation" },
      { key: "expected", value: "“A holiday next to the park”" },
      { key: "dataset", value: "pitch_golden_v4 · row 7 / 48" },
    ])
  })

  it("names the waiting slot for a human input step", () => {
    const why = sectionAt(evidenceOf(queueItem(1)), 1)
    expect(noteText(why)[0]).toMatch(/^Waiting for brief addition: /)
  })

  it("separates several post-checks and marks each result", () => {
    const produced = sectionAt(evidenceOf(queueItem(2)), 0)
    expect(produced.rows[3]?.value).toEqual([
      { glyph: "check", text: "hooks[*] non-empty" },
      { text: " · " },
      { glyph: "cross", text: "claims ⊆ facts" },
    ])
  })

  it("falls back to the none mark when a step has no judges or checks", () => {
    const item = queueItem(0)
    const detail = reviewDetail(item)
    const bare = { ...detail, judges: [], call: { ...detail.call, postChecks: [] } }
    const [produced, why] = reviewEvidence(bare, item, { ...copy, strong })
    expect(produced?.rows[3]?.value).toBe("—")
    expect(why?.rows[0]?.value).toBe("—")
  })
})
