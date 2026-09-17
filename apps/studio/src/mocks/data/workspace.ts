import type { RunRef, RunSummary, ShellData, WorkflowId, WorkflowSummary, WorkspaceRef } from "@/domain"
import { catalogOf } from "./catalog"
import { runLists } from "./run-list"
import { WORKFLOWS, WORKSPACE, perWorkflow, workflowKey } from "./keys"

const WORKSPACE_REF: WorkspaceRef = { id: WORKSPACE, initial: "A" }

const latestRunOf = (workflow: WorkflowId): RunSummary | null => runLists[workflowKey(workflow)]?.[0] ?? null

const lastRunOf = (workflow: WorkflowId): WorkflowSummary["lastRun"] => {
  const latest = latestRunOf(workflow)
  if (latest === null) return null
  return { id: latest.id, startedAt: latest.startedAt }
}

const runRefOf = (workflow: WorkflowId): RunRef | null => {
  const latest = latestRunOf(workflow)
  if (latest === null) return null
  return { id: latest.id, status: latest.status }
}

const summary = (id: WorkflowId): WorkflowSummary => ({ id, stageCount: catalogOf(id).stages.length, lastRun: lastRunOf(id) })

const workflows: readonly WorkflowSummary[] = [
  summary(WORKFLOWS.pitchPipeline),
  summary(WORKFLOWS.seoBriefWriter),
  summary(WORKFLOWS.reviewSummarizer),
  summary(WORKFLOWS.supportTriage),
]

export const shells: Readonly<Record<string, ShellData>> = perWorkflow((workflow) => ({
  workspace: WORKSPACE_REF,
  workflows,
  currentWorkflowId: workflow,
  latestRun: runRefOf(workflow),
}))
