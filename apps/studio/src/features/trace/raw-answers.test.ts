import { describe, expect, it } from "vitest"
import { collapseAnswers } from "./raw-answers"

const answer = JSON.stringify({ view: "right_side", legible: true, findings: [{ zone: "neck", kind: "oiliness" }] })
const reordered = JSON.stringify({ findings: [{ kind: "oiliness", zone: "neck" }], legible: true, view: "right_side" })

describe("collapseAnswers", () => {
  it("keeps one answer when every answer of the response is the same JSON in any key order", () => {
    expect(collapseAnswers([answer, reordered, answer].join("\n"))).toEqual({ text: answer, repeats: 3 })
  })

  it("keeps different answers as recorded", () => {
    const raw = [answer, JSON.stringify({ view: "left_side", legible: true, findings: [] })].join("\n")
    expect(collapseAnswers(raw)).toEqual({ text: raw, repeats: 1 })
  })

  it("keeps a single answer and text that is not JSON as recorded", () => {
    expect(collapseAnswers(answer)).toEqual({ text: answer, repeats: 1 })
    expect(collapseAnswers("short preview…\nshort preview…")).toEqual({ text: "short preview…\nshort preview…", repeats: 1 })
  })
})
