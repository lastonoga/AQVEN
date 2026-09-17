import type { IsoDateTime, RunRef, ShellData, WorkflowId, WorkflowSummary } from "@/domain"
import { OUTCOME_TONE, type Tone } from "@/components/studio"
import { joinMeta, runRef } from "@/lib/format"

export type WorkflowRowCopy = {
  readonly stages: (count: number) => string
  readonly run: (ref: string) => string
  readonly neverRun: string
  readonly since: (date: IsoDateTime) => string
}

export type WorkflowRow = {
  readonly id: WorkflowId
  readonly current: boolean
  readonly dot: Tone
  readonly meta: string
}

export type RunBadgeView = {
  readonly label: string
  readonly tone: Tone
}

const CURRENT_DOT: Tone = "llm"
const OTHER_DOT: Tone = "neutral"

const lastRunMeta = (lastRun: WorkflowSummary["lastRun"], copy: WorkflowRowCopy): readonly string[] => {
  if (lastRun === null) return [copy.neverRun]
  return [copy.run(runRef(lastRun.id)), copy.since(lastRun.startedAt)]
}

const workflowRow = (workflow: WorkflowSummary, currentId: WorkflowId, copy: WorkflowRowCopy): WorkflowRow => {
  const current = workflow.id === currentId
  return {
    id: workflow.id,
    current,
    dot: current ? CURRENT_DOT : OTHER_DOT,
    meta: joinMeta([copy.stages(workflow.stageCount), ...lastRunMeta(workflow.lastRun, copy)]),
  }
}

export const workflowRows = (shell: ShellData, copy: WorkflowRowCopy): readonly WorkflowRow[] =>
  shell.workflows.map((workflow) => workflowRow(workflow, shell.currentWorkflowId, copy))

export const runBadge = (run: RunRef): RunBadgeView => ({ label: runRef(run.id), tone: OUTCOME_TONE[run.status] })
