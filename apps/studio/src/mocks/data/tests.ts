import type { DatasetSummary, TestSummary, TestsOverview } from "@/domain"
import { datasetId, nodeId, runId, testId } from "@/data/ids"
import { pitchNode, pitchStage } from "./catalog"
import { daysAgo, hoursAgo } from "./clock"
import { WORKFLOWS, perWorkflow, workflowKey } from "./keys"

const PITCH_GOLDEN = datasetId("pitch_golden_v4")
const REGRESS_TRUNCATED = datasetId("regress_truncated")
const HOTELS_500 = datasetId("hotels_500")
const LOOP_REGRESS = datasetId("loop_regress")
const SMOKE_12 = datasetId("smoke_12")

const pitchPipelineTests: readonly TestSummary[] = [
  {
    id: testId("pitch_gen_b"),
    scope: { kind: "call", nodeId: nodeId("pitch_gen_b"), stage: pitchNode("pitch_gen_b").stage, role: "divergence" },
    datasetId: PITCH_GOLDEN,
    pass: { passed: 44, total: 48 },
    health: "failed",
    lastRunAt: hoursAgo(2),
  },
  {
    id: testId("diverge_stage_4"),
    scope: { kind: "stage", name: "diverge", stage: pitchStage("pitch_divergence").number, shape: { kind: "parallel", branches: 4 } },
    datasetId: PITCH_GOLDEN,
    pass: { passed: 41, total: 48 },
    health: "failed",
    lastRunAt: daysAgo(1),
  },
  {
    id: testId("critic_loop_stage_5"),
    scope: { kind: "stage", name: "critic_loop", stage: pitchStage("critic_loop").number, shape: { kind: "loop", threshold: 0.9 } },
    datasetId: LOOP_REGRESS,
    pass: { passed: 20, total: 20 },
    health: "ok",
    lastRunAt: daysAgo(1),
  },
  {
    id: testId("score_hotel"),
    scope: { kind: "call", nodeId: nodeId("score_hotel"), stage: pitchNode("score_hotel").stage, role: "map" },
    datasetId: HOTELS_500,
    pass: { passed: 486, total: 500 },
    health: "degraded",
    lastRunAt: daysAgo(3),
  },
  {
    id: testId("whole_workflow"),
    scope: { kind: "workflow", entryNodeId: nodeId("load_hotels") },
    datasetId: SMOKE_12,
    pass: { passed: 11, total: 12 },
    health: "degraded",
    lastRunAt: daysAgo(7),
  },
]

const pitchPipelineDatasets: readonly DatasetSummary[] = [
  {
    id: PITCH_GOLDEN,
    rowCount: 48,
    description: "5 columns + expected",
    source: { kind: "spreadsheet", agentExtended: true },
    assertionCount: 3,
    usedByTestCount: 2,
    updatedAt: hoursAgo(2),
  },
  {
    id: REGRESS_TRUNCATED,
    rowCount: 12,
    description: "agent-built from failures",
    source: { kind: "agent", fromRun: runId("8210"), toRun: runId("8247") },
    assertionCount: 2,
    usedByTestCount: 1,
    updatedAt: daysAgo(1),
  },
  {
    id: HOTELS_500,
    rowCount: 500,
    description: "DB export",
    source: { kind: "tool", adapter: "hotels.search" },
    assertionCount: 1,
    usedByTestCount: 1,
    updatedAt: daysAgo(3),
  },
  {
    id: LOOP_REGRESS,
    rowCount: 20,
    description: "candidates for the critic loop",
    source: { kind: "spreadsheet", agentExtended: false },
    assertionCount: 4,
    usedByTestCount: 1,
    updatedAt: daysAgo(1),
  },
  {
    id: SMOKE_12,
    rowCount: 12,
    description: "end-to-end run",
    source: { kind: "manual" },
    assertionCount: 3,
    usedByTestCount: 1,
    updatedAt: daysAgo(7),
  },
]

const EMPTY_OVERVIEW: TestsOverview = { tests: [], datasets: [] }

export const testsOverviews: Readonly<Record<string, TestsOverview>> = {
  ...perWorkflow(() => EMPTY_OVERVIEW),
  [workflowKey(WORKFLOWS.pitchPipeline)]: { tests: pitchPipelineTests, datasets: pitchPipelineDatasets },
}
