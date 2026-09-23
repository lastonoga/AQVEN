import type { ApiFlow, ApiRunBrief, ExperimentSummary, FlowId } from "@/domain"
import type { Tone } from "@/components/studio"
import { flowId as toFlowId } from "@/data/ids"
import { joinMeta } from "@/lib/format"

export type FlowDescriptions = Readonly<Record<string, string | null>>

export type FlowListCopy = {
  readonly nodes: (count: number) => string
  readonly lastRun: (startedAt: string) => string
  readonly neverRun: string
  readonly experiments: (count: number) => string
  readonly problems: (count: number) => string
}

export type FlowListRow = {
  readonly id: FlowId
  readonly description: string | null
  readonly meta: string
  readonly problems: { readonly label: string; readonly tone: Tone } | null
}

const startedAt = (flow: ApiFlow): number => (flow.last_run === null ? 0 : Date.parse(flow.last_run.started_at))

const byRecentRun = (left: ApiFlow, right: ApiFlow): number => startedAt(right) - startedAt(left) || right.node_count - left.node_count

const runMeta = (run: ApiRunBrief | null, copy: FlowListCopy): string => (run === null ? copy.neverRun : copy.lastRun(run.started_at))

const problemsOf = (flow: ApiFlow, copy: FlowListCopy): FlowListRow["problems"] => {
  const count = flow.problems.error + flow.problems.warning
  if (count === 0) return null
  return { label: copy.problems(count), tone: flow.problems.error > 0 ? "destructive" : "warning" }
}

export const experimentCounts = (experiments: readonly ExperimentSummary[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  experiments.forEach((experiment) => {
    if (experiment.flow === null) return
    counts.set(experiment.flow, (counts.get(experiment.flow) ?? 0) + 1)
  })
  return counts
}

export const flowListRows = (
  flows: readonly ApiFlow[],
  descriptions: FlowDescriptions,
  experiments: readonly ExperimentSummary[],
  copy: FlowListCopy,
): readonly FlowListRow[] => {
  const counts = experimentCounts(experiments)
  return [...flows].sort(byRecentRun).map((flow) => ({
    id: toFlowId(flow.flow_id),
    description: descriptions[flow.flow_id] ?? null,
    meta: joinMeta([copy.nodes(flow.node_count), runMeta(flow.last_run, copy), copy.experiments(counts.get(flow.flow_id) ?? 0)]),
    problems: problemsOf(flow, copy),
  }))
}
