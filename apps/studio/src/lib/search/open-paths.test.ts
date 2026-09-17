import { describe, expect, it } from "vitest"
import { columnPath } from "@/data/ids"
import { CLOSED_PATHS, togglePath } from "./open-paths"

const paths = (...raw: readonly string[]) => raw.map(columnPath)

describe("togglePath", () => {
  it("opens a path", () => {
    expect(togglePath([], columnPath("personas/persona_b2b"))).toEqual(paths("personas/persona_b2b"))
  })

  it("closes a path together with its descendants", () => {
    const open = paths("personas/persona_b2b", "personas/persona_b2b/iteration_3", "personas/persona_b2b/iteration_3/judge_facts", "other/x")
    expect(togglePath(open, columnPath("personas/persona_b2b"))).toEqual(paths("other/x"))
  })

  it("opening a path closes its open siblings and their descendants", () => {
    const open = paths("personas/persona_b2c", "personas/persona_b2c/iteration_1", "decision/decide_pitch")
    expect(togglePath(open, columnPath("personas/persona_b2b"))).toEqual(paths("decision/decide_pitch", "personas/persona_b2b"))
  })

  it("keeps ancestors when opening a nested path", () => {
    const open = paths("personas/persona_b2b", "personas/persona_b2b/iteration_2")
    expect(togglePath(open, columnPath("personas/persona_b2b/iteration_3"))).toEqual(
      paths("personas/persona_b2b", "personas/persona_b2b/iteration_3"),
    )
  })

  it("does not treat a shared name prefix as a descendant", () => {
    const open = paths("personas/persona_b2b", "personas/persona_b2b2")
    expect(togglePath(open, columnPath("personas/persona_b2b"))).toEqual(paths("personas/persona_b2b2"))
  })
})

describe("CLOSED_PATHS", () => {
  it("never reports a path as open", () => {
    CLOSED_PATHS.toggle(columnPath("personas/persona_b2b"))
    expect(CLOSED_PATHS.isOpen(columnPath("personas/persona_b2b"))).toBe(false)
  })
})
