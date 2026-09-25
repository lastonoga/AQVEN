import { describe, expect, it } from "vitest"
import type { AuthoringDataset } from "@/domain"
import * as ids from "@/data/ids"
import { datasetsForSubject, sameSelection, selectionKey, strayTags, wholeDataset, withDataset, withTag } from "./model"

const SUPPORT = ids.flowId("support_case")

const dataset = (id: string, flow: string | null, total = 4): AuthoringDataset => ({
  id: ids.datasetId(id),
  flow: flow === null ? null : ids.flowId(flow),
  total,
  splits: { dev: 1, holdout: total - 1 },
  tags: [{ tag: "regression", values: [{ value: "no", count: 3 }, { value: "yes", count: 1 }] }],
})

const DATASETS = [dataset("panel_cases", "judge_panel"), dataset("support_cases", "support_case"), dataset("loose", null), dataset("more_support", "support_case")]

const idsOf = (datasets: readonly AuthoringDataset[]): readonly string[] => datasets.map((item) => item.id)

describe("authoring model", () => {
  it("offers a project flow only its own datasets, and keeps the current one even when it belongs elsewhere", () => {
    expect(idsOf(datasetsForSubject(DATASETS, { flow: SUPPORT, local: false }))).toEqual(["more_support", "support_cases"])
    expect(idsOf(datasetsForSubject(DATASETS, { flow: SUPPORT, local: false }, ids.datasetId("loose")))).toEqual(["more_support", "support_cases", "loose"])
  })

  it("offers a local flow every dataset, those of the same flow first", () => {
    expect(idsOf(datasetsForSubject(DATASETS, { flow: SUPPORT, local: true }))).toEqual(["more_support", "support_cases", "loose", "panel_cases"])
  })

  it("sets, replaces and clears one tag at a time, and starts a new dataset with no tags", () => {
    const start = withDataset(ids.datasetId("support_cases"))
    expect(start.tags).toEqual({})
    const tagged = withTag(withTag(start, "regression", "yes"), "channel", "amazon")
    expect(tagged.tags).toEqual({ regression: "yes", channel: "amazon" })
    expect(withTag(tagged, "regression", "no").tags).toEqual({ channel: "amazon", regression: "no" })
    expect(withTag(tagged, "regression", null).tags).toEqual({ channel: "amazon" })
  })

  it("compares selections regardless of the order of their tags", () => {
    const left = { dataset: ids.datasetId("support_cases"), tags: { a: "1", b: "2" } }
    const right = { dataset: ids.datasetId("support_cases"), tags: { b: "2", a: "1" } }
    expect(selectionKey(left)).toBe(selectionKey(right))
    expect(sameSelection(left, right)).toBe(true)
    expect(sameSelection(left, { ...right, dataset: ids.datasetId("loose") })).toBe(false)
    expect(sameSelection(left, { ...right, tags: { a: "1" } })).toBe(false)
  })

  it("names the tag values no case of the dataset has", () => {
    const support = dataset("support_cases", "support_case")
    expect(strayTags({ dataset: support.id, tags: { regression: "yes", channel: "amazon", } }, support)).toEqual([["channel", "amazon"]])
    expect(strayTags({ dataset: support.id, tags: { regression: "maybe" } }, support)).toEqual([["regression", "maybe"]])
  })

  it("counts the whole dataset when no tag is set", () => {
    expect(wholeDataset(dataset("support_cases", "support_case", 12))).toEqual({ selected: 12, total: 12, splits: { dev: 1, holdout: 11 } })
  })
})
