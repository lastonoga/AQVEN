import type { RunSummary } from "@/domain"
import { runId } from "@/data/ids"
import { daysAgo, hoursAgo } from "./clock"
import { WORKFLOWS, workflowKey } from "./keys"

const pitchPipelineRuns: readonly RunSummary[] = [
  {
    id: runId("8247"),
    status: "degraded",
    origin: { kind: "fork", of: runId("8241") },
    costUsd: 0.4187,
    durationS: 18.42,
    assertions: { passed: 44, total: 48 },
    startedAt: hoursAgo(2),
  },
  {
    id: runId("8244"),
    status: "ok",
    origin: { kind: "fork", of: runId("8241") },
    costUsd: 0.0835,
    durationS: 7.94,
    assertions: { passed: 0, total: 48 },
    startedAt: hoursAgo(9),
  },
  {
    id: runId("8241"),
    status: "ok",
    origin: { kind: "baseline" },
    costUsd: 0.3102,
    durationS: 16.3,
    assertions: { passed: 46, total: 48 },
    startedAt: daysAgo(1),
  },
  {
    id: runId("8236"),
    status: "degraded",
    origin: { kind: "fork", of: runId("8229") },
    costUsd: 1.0413,
    durationS: 64.64,
    assertions: { passed: 45, total: 48 },
    startedAt: hoursAgo(36),
  },
  {
    id: runId("8233"),
    status: "failed",
    origin: { kind: "fork", of: runId("8229") },
    costUsd: 0.0768,
    durationS: 7.1,
    assertions: { passed: 31, total: 48 },
    startedAt: daysAgo(2),
  },
  {
    id: runId("8229"),
    status: "ok",
    origin: { kind: "baseline" },
    costUsd: 0.2988,
    durationS: 15.8,
    assertions: { passed: 45, total: 48 },
    startedAt: daysAgo(3),
  },
  {
    id: runId("8210"),
    status: "ok",
    origin: { kind: "fork", of: runId("8204") },
    costUsd: 0.334,
    durationS: 17.05,
    assertions: { passed: 43, total: 48 },
    startedAt: daysAgo(7),
  },
]

const seoBriefWriterRuns: readonly RunSummary[] = [
  {
    id: runId("8102"),
    status: "ok",
    origin: { kind: "baseline" },
    costUsd: 0.124,
    durationS: 9.6,
    assertions: { passed: 24, total: 24 },
    startedAt: daysAgo(1),
  },
]

const reviewSummarizerRuns: readonly RunSummary[] = [
  {
    id: runId("7980"),
    status: "ok",
    origin: { kind: "baseline" },
    costUsd: 0.087,
    durationS: 6.2,
    assertions: { passed: 18, total: 18 },
    startedAt: daysAgo(3),
  },
]

export const runLists: Readonly<Record<string, readonly RunSummary[]>> = {
  [workflowKey(WORKFLOWS.pitchPipeline)]: pitchPipelineRuns,
  [workflowKey(WORKFLOWS.seoBriefWriter)]: seoBriefWriterRuns,
  [workflowKey(WORKFLOWS.reviewSummarizer)]: reviewSummarizerRuns,
  [workflowKey(WORKFLOWS.supportTriage)]: [],
}
