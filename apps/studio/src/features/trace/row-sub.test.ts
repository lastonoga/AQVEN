import { describe, expect, it } from "vitest"
import type { MatrixGroup, RowKey } from "@/domain"
import { rowEmphasis, rowGround, rowSub } from "./row-sub"
import { DIVERGE_STAGE, LOOP_STAGE, MAP_STAGE, PERSONA_GROUP } from "./test-support"
import { traceT } from "./test-support"

const firstGroup = (groups: readonly MatrixGroup[]): MatrixGroup => {
  const [group] = groups
  if (group === undefined) throw new Error("fixture without groups")
  return group
}

const nestedGroup = (group: MatrixGroup): MatrixGroup => {
  const block = group.columns[0]?.child?.block
  if (block === undefined) throw new Error("fixture without nested block")
  return block.group
}

const subOf = (group: MatrixGroup, key: RowKey): string | undefined => rowSub({ key }, group, traceT)

describe("ROW_SUB", () => {
  const diverge = firstGroup(DIVERGE_STAGE.groups)
  const loop = firstGroup(LOOP_STAGE.groups)
  const map = firstGroup(MAP_STAGE.groups)
  const nestedLoop = nestedGroup(PERSONA_GROUP)
  const judges = nestedGroup(nestedLoop)

  it("labels the columns row with the column count", () => {
    expect(subOf(PERSONA_GROUP, "columns")).toBe("3 in parallel")
  })

  it("labels headed call rows by group kind only", () => {
    expect(subOf(PERSONA_GROUP, "call")).toBe("diverge branch")
    expect(subOf(nestedLoop, "call")).toBe("loop body")
    expect(subOf(diverge, "call")).toBeUndefined()
  })

  it("derives agent, model, output and assertions sub-labels", () => {
    expect(subOf(diverge, "agent")).toBe("model · config")
    expect(subOf(PERSONA_GROUP, "model")).toBe("$ · time")
    expect(subOf(judges, "output")).toBe("verdict")
    expect(subOf(PERSONA_GROUP, "assertions")).toBe("3 per row")
    expect(subOf(map, "prompt")).toBeUndefined()
  })

  it("marks the shared dataset input with its row", () => {
    expect(subOf(diverge, "input")).toBe("row #07")
  })

  it("picks the scorer threshold before the generic post-check label", () => {
    expect(subOf(loop, "postCheck")).toBe("scorer · threshold 0.90")
    expect(subOf(diverge, "postCheck")).toBe("validators · scorers")
  })

  it("lets the row detail win", () => {
    expect(rowSub({ key: "call", detail: "judge_panel" }, judges, traceT)).toBe("judge_panel")
  })
})

describe("row ground and emphasis", () => {
  it("grounds given rows subtle only in unheaded groups", () => {
    expect(rowGround("input", false)).toBe("subtle")
    expect(rowGround("prompt", false)).toBe("subtle")
    expect(rowGround("input", true)).toBe("card")
    expect(rowGround("output", false)).toBe("card")
  })

  it("emphasises the output row only in unheaded groups", () => {
    expect(rowEmphasis("output", false)).toBe(true)
    expect(rowEmphasis("output", true)).toBe(false)
    expect(rowEmphasis("call", false)).toBe(false)
  })
})
