import { describe, expect, it } from "vitest"
import { createTranslator } from "use-intl"
import type { TestsOverview } from "@/domain"
import { datasetId, nodeId } from "@/data/ids"
import { messages } from "@/i18n/messages"
import { joinMeta, ratio } from "@/lib/format"
import { WORKFLOW_IDS, WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { testsOverviews } from "@/mocks/data/tests"
import type { Translator } from "@/i18n/translator"
import { datasetRowCounts, presentDatasetRef, presentDatasetSummary, presentScope, presentSource, presentStageShape } from "./presenters"

const t: Translator<"tests"> = createTranslator({ locale: "en", messages: messages.en, namespace: "tests" })

const EMPTY: TestsOverview = { tests: [], datasets: [] }

const overview = testsOverviews[workflowKey(WORKFLOWS.pitchPipeline)] ?? EMPTY
const rowCounts = datasetRowCounts(overview.datasets)

describe("tests presenters", () => {
  it("renders the test scope titles and subtitles of the design", () => {
    const views = overview.tests.map((test) => presentScope(test.scope, t))
    expect(views.map((view) => joinMeta(view.title))).toEqual([
      "pitch_gen_b",
      "diverge · stage 4",
      "critic_loop · stage 5",
      "score_hotel",
      "whole workflow",
    ])
    expect(views.map((view) => joinMeta(view.subtitle))).toEqual([
      "call · stage 4 · divergence",
      "stage · 4 branches in parallel",
      "stage · loop to threshold 0.90",
      "call · stage 2 · map",
      "end-to-end run from load_hotels",
    ])
  })

  it("renders the dataset reference and pass ratio of every test", () => {
    expect(overview.tests.map((test) => joinMeta(presentDatasetRef(test.datasetId, rowCounts, t)))).toEqual([
      "pitch_golden_v4 · 48 rows",
      "pitch_golden_v4 · 48 rows",
      "loop_regress · 20 rows",
      "hotels_500 · 500 rows",
      "smoke_12 · 12 rows",
    ])
    expect(overview.tests.map((test) => ratio(test.pass))).toEqual(["44 / 48", "41 / 48", "20 / 20", "486 / 500", "11 / 12"])
  })

  it("renders the dataset summaries and sources of the design", () => {
    expect(overview.datasets.map((dataset) => joinMeta(presentDatasetSummary(dataset, t)))).toEqual([
      "48 rows · 5 columns + expected",
      "12 rows · agent-built from failures",
      "500 rows · DB export",
      "20 rows · candidates for the critic loop",
      "12 rows · end-to-end run",
    ])
    expect(overview.datasets.map((dataset) => joinMeta(presentSource(dataset.source, t)))).toEqual([
      "spreadsheet + agent-extended",
      "agent · from runs #8210…#8247",
      "tool hotels.search · snapshot",
      "spreadsheet",
      "manual",
    ])
  })

  it("uses singular plural forms", () => {
    expect(presentStageShape({ kind: "parallel", branches: 1 }, t)).toBe("1 branch in parallel")
    expect(joinMeta(presentDatasetRef(datasetId("one_row"), new Map([[datasetId("one_row"), 1]]), t))).toBe("one_row · 1 row")
    expect(t("datasets.assertions", { count: 1 })).toBe("1 assertion")
  })

  it("keeps only the dataset id when the dataset is not listed", () => {
    expect(presentDatasetRef(datasetId("unlisted"), rowCounts, t)).toEqual(["unlisted"])
  })

  it("titles a workflow scope from the messages, not from the data", () => {
    const view = presentScope({ kind: "workflow", entryNodeId: nodeId("fetch_reviews") }, t)
    expect(view).toEqual({ title: ["whole workflow"], subtitle: ["end-to-end run from fetch_reviews"] })
  })
})

describe("tests mock data", () => {
  it("lists every dataset a test points to", () => {
    WORKFLOW_IDS.forEach((workflow) => {
      const data = testsOverviews[workflowKey(workflow)] ?? EMPTY
      const listed = new Set(data.datasets.map((dataset) => dataset.id))
      expect(data.tests.filter((test) => !listed.has(test.datasetId))).toEqual([])
    })
  })

  it("serves an overview for every workflow", () => {
    expect(WORKFLOW_IDS.filter((workflow) => testsOverviews[workflowKey(workflow)] === undefined)).toEqual([])
  })

  it("keeps pass totals equal to the dataset row counts", () => {
    expect(overview.tests.filter((test) => rowCounts.get(test.datasetId) !== test.pass.total)).toEqual([])
  })
})
