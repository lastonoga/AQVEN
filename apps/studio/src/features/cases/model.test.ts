import { describe, expect, it } from "vitest"
import type { ApiDatasetCase, ApiDatasetSummary, CaseTags, ExperimentDetail } from "@/domain"
import * as ids from "@/data/ids"
import {
  addCasesPrompt,
  datasetScope,
  experimentsUsing,
  filterCases,
  hasExpected,
  isTagToken,
  matchesTags,
  nodeOutputIds,
  orderedSelection,
  parseTagToken,
  pickDataset,
  tagFacets,
  tagSummary,
  tagTokens,
  toggleName,
  toggleToken,
  withCase,
  withNames,
  withTags,
} from "./model"

const FLOW = ids.flowId("support_case")

const item = (name: string, tags: CaseTags | null, extra: Partial<ApiDatasetCase> = {}): ApiDatasetCase => ({ name, inputs: { message: name }, tags, ...extra })

const CASES: readonly ApiDatasetCase[] = [
  item("strip_flicker_credit", { lamp_kind: "smart_wifi", channel: "amazon", regression: "no" }, { expected_output: { intent: "defect" } }),
  item("bulb_app_offline_advice", { lamp_kind: "smart_wifi", channel: "storefront", regression: "yes" }, { node_outputs: { prepare: {}, triage: {} } }),
  item("lamp_crushed_box_reship", { lamp_kind: "mains", channel: "ozon", regression: "yes" }, { expected_output: null }),
  item("untagged_case", null),
]

const summary = (dataset: string, flow: string | null): ApiDatasetSummary => ({
  dataset_id: dataset,
  flow_id: flow,
  path: `datasets/${dataset}.yaml`,
  file_hash: "sha256-test",
  cases: 3,
  splits: {},
})

const experiment = (id: string, dataset: string, tags: CaseTags): ExperimentDetail => ({
  id: ids.experimentId(id),
  description: id,
  flow: FLOW,
  subject: { kind: "flow", flow: FLOW, local: false },
  failureMode: null,
  archived: false,
  latest: null,
  seriesCount: 0,
  spentUsd: 0,
  activity: { created: null, last: null, source: null, running: false, attention: [] },
  question: { kind: "look" },
  varies: null,
  slots: [],
  agents: [],
  flows: [],
  alternatives: [],
  prompts: [],
  cases: { dataset: ids.datasetId(dataset), flow: FLOW, tags, selected: 0, total: 0, splits: { dev: 0, holdout: 0 } },
  variants: [],
  checks: [],
  metrics: [],
  plan: { cases: null, repeats: 1 },
  notes: null,
  files: { spec: ids.filePath(`experiments/${id}/experiment.yaml`), notes: null },
})

const names = (cases: readonly ApiDatasetCase[]): readonly string[] => cases.map((entry) => entry.name)

describe("case tags", () => {
  it("counts every tag value by key, the most common value first", () => {
    expect(tagFacets(CASES)).toEqual([
      { key: "lamp_kind", values: [{ value: "smart_wifi", count: 2 }, { value: "mains", count: 1 }] },
      { key: "channel", values: [{ value: "amazon", count: 1 }, { value: "ozon", count: 1 }, { value: "storefront", count: 1 }] },
      { key: "regression", values: [{ value: "yes", count: 2 }, { value: "no", count: 1 }] },
    ])
  })

  it("writes tags as key=value tokens and only accepts tokens with a key", () => {
    expect(tagTokens({ lamp_kind: "mains", channel: "ozon" })).toEqual(["lamp_kind=mains", "channel=ozon"])
    expect(isTagToken("lamp_kind=mains")).toBe(true)
    expect(isTagToken("url=a=b")).toBe(true)
    expect(isTagToken("=mains")).toBe(false)
    expect(isTagToken("mains")).toBe(false)
    expect(parseTagToken("url=a=b")).toEqual({ key: "url", value: "a=b" })
    expect(parseTagToken("mains")).toBeNull()
  })

  it("shows the first tag values and counts the rest", () => {
    const tags = { lamp_kind: "mains", channel: "storefront", reason: "replacement", regression: "yes", tier: "gold" }
    expect(tagSummary(tags, 3)).toEqual({ values: ["mains", "storefront", "replacement"], hidden: 2 })
    expect(tagSummary({ channel: "ozon" }, 3)).toEqual({ values: ["ozon"], hidden: 0 })
    expect(tagSummary({}, 3)).toEqual({ values: [], hidden: 0 })
  })

  it("matches any value of one key and every key at once", () => {
    expect(matchesTags({ lamp_kind: "mains", channel: "ozon" }, ["lamp_kind=mains", "lamp_kind=smart_wifi"])).toBe(true)
    expect(matchesTags({ lamp_kind: "mains", channel: "ozon" }, ["lamp_kind=mains", "channel=amazon"])).toBe(false)
    expect(matchesTags({}, ["lamp_kind=mains"])).toBe(false)
    expect(matchesTags({}, [])).toBe(true)
  })

  it("filters cases by tags and by a part of the name", () => {
    expect(names(filterCases(CASES, { tags: ["regression=yes"], query: "" }))).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship"])
    expect(names(filterCases(CASES, { tags: ["regression=yes", "lamp_kind=smart_wifi"], query: "" }))).toEqual(["bulb_app_offline_advice"])
    expect(names(filterCases(CASES, { tags: [], query: " CRUSHED " }))).toEqual(["lamp_crushed_box_reship"])
    expect(names(filterCases(CASES, { tags: [], query: "" }))).toEqual(names(CASES))
  })

  it("toggles a tag token in and out of the filter", () => {
    expect(toggleToken(["a=1"], "b=2")).toEqual(["a=1", "b=2"])
    expect(toggleToken(["a=1", "b=2"], "a=1")).toEqual(["b=2"])
  })
})

describe("case marks", () => {
  it("marks an expected output only when the case carries a value", () => {
    expect(CASES.map(hasExpected)).toEqual([true, false, false, false])
  })

  it("lists the nodes whose outputs the case supplies", () => {
    expect(CASES.map(nodeOutputIds)).toEqual([[], ["prepare", "triage"], [], []])
  })
})

describe("case selection", () => {
  it("toggles one case and sets or clears the shown ones", () => {
    const one = toggleName(new Set<string>(), "strip_flicker_credit")
    expect([...one]).toEqual(["strip_flicker_credit"])
    expect([...toggleName(one, "strip_flicker_credit")]).toEqual([])
    const shown = withNames(one, ["bulb_app_offline_advice", "lamp_crushed_box_reship"], true)
    expect([...shown].sort()).toEqual(["bulb_app_offline_advice", "lamp_crushed_box_reship", "strip_flicker_credit"])
    expect([...withNames(shown, ["bulb_app_offline_advice", "lamp_crushed_box_reship"], false)]).toEqual(["strip_flicker_credit"])
  })

  it("keeps the dataset order of the selected cases", () => {
    expect(orderedSelection(CASES, new Set(["untagged_case", "strip_flicker_credit"]))).toEqual(["strip_flicker_credit", "untagged_case"])
  })
})

describe("experiments of a case", () => {
  it("keeps the experiments whose dataset and tag filter select the case", () => {
    const experiments = [
      experiment("all_cases", "support_case_cases", {}),
      experiment("regressions", "support_case_cases", { regression: "yes" }),
      experiment("other_dataset", "judge_panel_cases", {}),
    ]
    const [first, second] = CASES
    if (first === undefined || second === undefined) throw new Error("missing cases")
    expect(experimentsUsing(experiments, "support_case_cases", first).map((entry) => entry.id)).toEqual(["all_cases"])
    expect(experimentsUsing(experiments, "support_case_cases", second).map((entry) => entry.id)).toEqual(["all_cases", "regressions"])
  })
})

describe("datasets", () => {
  const datasets = [summary("reply_cases", null), summary("judge_panel_cases", "judge_panel"), summary("support_case_cases", "support_case")]

  it("tells whether a dataset runs on this flow", () => {
    expect(datasets.map((dataset) => datasetScope(dataset, FLOW))).toEqual(["inference", "otherFlow", "flow"])
  })

  it("opens the requested dataset, else the one of this flow, else the first", () => {
    expect(pickDataset(datasets, "judge_panel_cases", FLOW)?.dataset_id).toBe("judge_panel_cases")
    expect(pickDataset(datasets, "missing", FLOW)?.dataset_id).toBe("support_case_cases")
    expect(pickDataset(datasets, undefined, ids.flowId("other"))?.dataset_id).toBe("reply_cases")
    expect(pickDataset([], undefined, FLOW)).toBeNull()
  })

  it("asks the agent to add to the dataset of this flow or to write a new one, with no cap on the count", () => {
    const add = addCasesPrompt(FLOW, summary("support_case_cases", "support_case"))
    expect(add).toContain("Add cases to the dataset support_case_cases in datasets/support_case_cases.yaml for flow support_case")
    expect(add).toContain("how many cases I need")
    expect(add).not.toMatch(/\b20\b/u)
    expect(addCasesPrompt(FLOW, null)).toContain("Write a new dataset file datasets/support_case_cases.yaml with cases for flow support_case")
  })
})

describe("case search", () => {
  it("replaces the tag filter and drops it when empty", () => {
    expect(withTags({ dataset: "d", case: "c", tag: ["a=1"] }, ["b=2"])).toEqual({ dataset: "d", case: "c", tag: ["b=2"] })
    expect(withTags({ dataset: "d", tag: ["a=1"] }, [])).toEqual({ dataset: "d" })
  })

  it("opens one case and closes it", () => {
    expect(withCase({ dataset: "d" }, "c")).toEqual({ dataset: "d", case: "c" })
    expect(withCase({ dataset: "d", case: "c" }, null)).toEqual({ dataset: "d" })
  })
})
