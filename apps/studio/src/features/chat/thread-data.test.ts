import { describe, expect, it } from "vitest"
import type { ChatToolCallPart, DatasetId, RunId } from "@/domain"
import { chatThreads } from "@/mocks/data/chat"
import { WORKFLOW_IDS, workflowKey } from "@/mocks/data/keys"
import { runLists } from "@/mocks/data/run-list"
import { testsOverviews } from "@/mocks/data/tests"
import { threadToolCalls } from "./test-support"

const producedRun = (runId: RunId | null | undefined): readonly RunId[] => (runId === null || runId === undefined ? [] : [runId])

const runIdsOf = (part: ChatToolCallPart): readonly RunId[] => {
  if (part.toolName === "read_run") return [part.args.runId]
  if (part.toolName === "run_dataset") return producedRun(part.result?.runId)
  return []
}

const datasetIdsOf = (part: ChatToolCallPart): readonly DatasetId[] => {
  if (part.toolName !== "run_dataset") return []
  return [part.args.datasetId, ...(part.result?.scores ?? []).map((score) => score.datasetId)]
}

describe("chat mock backend", () => {
  it.each(WORKFLOW_IDS)("serves a non-empty thread for %s", (workflow) => {
    expect(chatThreads[workflowKey(workflow)]?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(WORKFLOW_IDS)("only references runs and datasets that %s serves", (workflow) => {
    const key = workflowKey(workflow)
    const calls = threadToolCalls(chatThreads[key] ?? [])
    const runs = new Set((runLists[key] ?? []).map((run) => run.id))
    const datasets = new Set((testsOverviews[key]?.datasets ?? []).map((dataset) => dataset.id))
    expect(calls.flatMap(runIdsOf).filter((id) => !runs.has(id))).toEqual([])
    expect(calls.flatMap(datasetIdsOf).filter((id) => !datasets.has(id))).toEqual([])
  })
})
