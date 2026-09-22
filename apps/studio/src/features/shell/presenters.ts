import type { ApiFlow, ApiFlowDetail, ApiProject, ApiRunBrief, FlowId, RunStatus } from "@/domain"
import { RUN_STATUS_TONE, type Tone } from "@/components/studio"
import { flowId as toFlowId } from "@/data/ids"
import { joinMeta, runRef } from "@/lib/format"

export type FlowRowCopy = {
  readonly nodes: (count: number) => string
  readonly run: (ref: string) => string
  readonly neverRun: string
  readonly since: (startedAt: string) => string
}

export type FlowRow = {
  readonly id: FlowId
  readonly current: boolean
  readonly dot: Tone
  readonly meta: string
}

export type RunBadgeView = {
  readonly label: string
  readonly full: string
  readonly status: RunStatus
  readonly tone: Tone
}

export type StatusTagId = "io" | "problems" | "run"
export type StatusTag = { readonly id: StatusTagId; readonly label: string; readonly tone: Tone }

export type FlowStatusCopy = {
  readonly io: (input: string, output: string) => string
  readonly problems: (count: number) => string
  readonly neverRun: string
  readonly lastRun: (status: RunStatus) => string
  readonly unknownType: string
}

const CURRENT_DOT: Tone = "llm"
const OTHER_DOT: Tone = "neutral"
const PATH_SEPARATOR = "/"

const lastRunMeta = (lastRun: ApiRunBrief | null, copy: FlowRowCopy): readonly string[] => {
  if (lastRun === null) return [copy.neverRun]
  return [copy.run(runRef(lastRun.run_id)), copy.since(lastRun.started_at)]
}

const flowRow = (flow: ApiFlow, currentId: FlowId, copy: FlowRowCopy): FlowRow => {
  const current = flow.flow_id === currentId
  return {
    id: toFlowId(flow.flow_id),
    current,
    dot: current ? CURRENT_DOT : OTHER_DOT,
    meta: joinMeta([copy.nodes(flow.node_count), ...lastRunMeta(flow.last_run, copy)]),
  }
}

export const projectName = (project: ApiProject): string => project.package ?? project.root.split(PATH_SEPARATOR).filter(Boolean).at(-1) ?? project.root

export const projectInitial = (project: ApiProject): string => projectName(project).slice(0, 1).toUpperCase()

export const flowRows = (flows: readonly ApiFlow[], currentId: FlowId, copy: FlowRowCopy): readonly FlowRow[] =>
  flows.map((flow) => flowRow(flow, currentId, copy))

export const runBadge = (run: ApiRunBrief): RunBadgeView => ({
  label: runRef(run.run_id),
  full: run.run_id,
  status: run.status,
  tone: RUN_STATUS_TONE[run.status],
})

const problemsTag = (flow: ApiFlowDetail, copy: FlowStatusCopy): readonly StatusTag[] => {
  const count = flow.problems.error + flow.problems.warning
  if (count === 0) return []
  return [{ id: "problems", label: copy.problems(count), tone: flow.problems.error > 0 ? "destructive" : "warning" }]
}

const runTag = (flow: ApiFlowDetail, copy: FlowStatusCopy): StatusTag => {
  if (flow.last_run === null) return { id: "run", label: copy.neverRun, tone: "neutral" }
  return { id: "run", label: copy.lastRun(flow.last_run.status), tone: RUN_STATUS_TONE[flow.last_run.status] }
}

export const flowStatusTags = (flow: ApiFlowDetail, copy: FlowStatusCopy): readonly StatusTag[] => [
  { id: "io", label: copy.io(flow.input_type ?? copy.unknownType, flow.output_type ?? copy.unknownType), tone: "neutral" },
  ...problemsTag(flow, copy),
  runTag(flow, copy),
]
