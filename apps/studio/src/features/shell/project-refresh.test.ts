import { describe, expect, it } from "vitest"
import type { ApiSpecEvent } from "@/domain"
import { ROUTE_ID } from "@/lib/routes"
import { EMPTY_LEDGER, LEDGER_TTL_MS, planRefresh, remember, touchesMatch, type RefreshMatch } from "./project-refresh"
import {
  diagnosticsChanged,
  experimentChanged,
  filesChanged,
  findingWritten,
  resync,
  seriesProgressed,
  seriesStarted,
  seriesStatusChanged,
} from "./test-support"

const EXPERIMENT = "reply_noninferior_mistral"
const OTHER_EXPERIMENT = "panel_single_judge"
const SERIES = "01a0c100-0000-7000-8000-000000000001"
const LOOK = "01a0c100-0000-7000-8000-000000000009"
const EXPERIMENT_FILE = `experiments/${EXPERIMENT}/experiment.yaml`
const FINDING_FILE = `experiments/${EXPERIMENT}/findings/${SERIES}.yaml`
const SUMMARY_FILE = "FINDINGS.md"
const FLOW_FILE = "flows/support_case/flow.yaml"
const NOW = 1_000_000

const finding = (seq: number): ApiSpecEvent => findingWritten(seq, EXPERIMENT, SERIES, [FINDING_FILE, SUMMARY_FILE])

const RESEARCH_LIST: RefreshMatch = { routeId: ROUTE_ID.research, params: {} }
const SERIES_LIST: RefreshMatch = { routeId: ROUTE_ID.seriesList, params: {} }
const CASES: RefreshMatch = { routeId: ROUTE_ID.cases, params: { flowId: "support_case" } }
const CANVAS: RefreshMatch = { routeId: ROUTE_ID.canvas, params: { flowId: "support_case" } }
const PROJECT: RefreshMatch = { routeId: ROUTE_ID.project, params: {} }
const experimentPage = (experimentId: string): RefreshMatch => ({ routeId: ROUTE_ID.experiment, params: { experimentId } })
const seriesPage = (seriesId: string): RefreshMatch => ({ routeId: ROUTE_ID.series, params: { seriesId } })

const affected = (events: readonly ApiSpecEvent[], matches: readonly RefreshMatch[]): readonly RefreshMatch[] => {
  const plan = planRefresh(events, remember(EMPTY_LEDGER, events, NOW))
  return matches.filter((match) => touchesMatch(plan.touches, match))
}

const ALL_PAGES: readonly RefreshMatch[] = [
  PROJECT,
  RESEARCH_LIST,
  SERIES_LIST,
  CASES,
  CANVAS,
  experimentPage(EXPERIMENT),
  experimentPage(OTHER_EXPERIMENT),
  seriesPage(SERIES),
  seriesPage(LOOK),
]

describe("research events touch only the pages that show the fact", () => {
  it("a started series refreshes both lists, its experiment and its own page", () => {
    expect(affected([seriesStarted(1, SERIES, EXPERIMENT)], ALL_PAGES)).toEqual([RESEARCH_LIST, SERIES_LIST, CASES, experimentPage(EXPERIMENT), seriesPage(SERIES)])
  })

  it("progress leaves the experiment list alone", () => {
    expect(affected([seriesProgressed(1, SERIES, EXPERIMENT)], ALL_PAGES)).toEqual([SERIES_LIST, experimentPage(EXPERIMENT), seriesPage(SERIES)])
  })

  it("a look has no experiment to refresh", () => {
    expect(affected([seriesStatusChanged(1, LOOK, null)], ALL_PAGES)).toEqual([SERIES_LIST, seriesPage(LOOK)])
  })

  it("a finding refreshes the experiment list, its experiment and its series", () => {
    expect(affected([finding(1)], ALL_PAGES)).toEqual([RESEARCH_LIST, CASES, experimentPage(EXPERIMENT), seriesPage(SERIES)])
  })

  it("an experiment file change refreshes the experiment list, the cases tab and that experiment only", () => {
    expect(affected([experimentChanged(1, OTHER_EXPERIMENT, [`experiments/${OTHER_EXPERIMENT}/experiment.yaml`])], ALL_PAGES)).toEqual([
      RESEARCH_LIST,
      CASES,
      experimentPage(OTHER_EXPERIMENT),
    ])
  })
})

describe("spec changes still refresh everything unless research explains them", () => {
  it("a file change outside research refreshes everything", () => {
    expect(planRefresh([filesChanged(1, [FLOW_FILE])], EMPTY_LEDGER).everything).toBe(true)
  })

  it("an experiment file change announced in the same batch is not a reason to refresh everything", () => {
    const events = [filesChanged(1, [EXPERIMENT_FILE]), experimentChanged(2, EXPERIMENT, [EXPERIMENT_FILE])]
    const plan = planRefresh(events, remember(EMPTY_LEDGER, events, NOW))
    expect(plan.everything).toBe(false)
    expect(plan.touches).toHaveLength(1)
  })

  it("a batch that mixes an explained and an unexplained path refreshes everything", () => {
    const events = [filesChanged(1, [EXPERIMENT_FILE, FLOW_FILE]), experimentChanged(2, EXPERIMENT, [EXPERIMENT_FILE])]
    expect(planRefresh(events, remember(EMPTY_LEDGER, events, NOW)).everything).toBe(true)
  })

  it("the files of a finding written earlier explain the watcher's later report within the ledger window", () => {
    const early = remember(EMPTY_LEDGER, [finding(1)], NOW)
    const later = [filesChanged(2, [FINDING_FILE, SUMMARY_FILE])]
    expect(planRefresh(later, remember(early, later, NOW + 1_000)).everything).toBe(false)
    expect(planRefresh(later, remember(early, later, NOW + LEDGER_TTL_MS + 1)).everything).toBe(true)
  })

  it("diagnostics and a resync always refresh everything", () => {
    expect(planRefresh([diagnosticsChanged(1)], EMPTY_LEDGER).everything).toBe(true)
    expect(planRefresh([resync(1)], EMPTY_LEDGER).everything).toBe(true)
  })

  it("research alone never refreshes everything", () => {
    const events = [seriesStarted(1, SERIES, EXPERIMENT), seriesProgressed(2, SERIES, EXPERIMENT), finding(3)]
    expect(planRefresh(events, remember(EMPTY_LEDGER, events, NOW)).everything).toBe(false)
  })
})
