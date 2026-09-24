import { describe, expect, it } from "vitest"
import { groupFindings } from "./check-cells"
import type { CheckFinding } from "./model"

const finding = (attempt: number, note: string, pass = false, name = "check_failed"): CheckFinding => ({ name, pass, note, attempt })

describe("groupFindings", () => {
  it("folds the same check, verdict and feedback into one group with its attempts", () => {
    const groups = groupFindings([finding(1, "zone outside the set"), finding(2, "zone outside the set"), finding(2, "zone outside the set")])
    expect(groups).toEqual([{ finding: finding(1, "zone outside the set"), count: 3, attempts: 2 }])
  })

  it("keeps outcomes apart when the feedback, the verdict or the check differs", () => {
    const groups = groupFindings([finding(1, "a"), finding(2, "b"), finding(3, "a", true), finding(4, "a", false, "schema")])
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1, 1])
  })
})
