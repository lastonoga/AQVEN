import type { ExperimentSummary, FlowId } from "@/domain"
import { experimentFlow, groupByFlow } from "./flow-groups"

export const GROUPINGS = ["activity", "flow", "failureMode"] as const
export type Grouping = (typeof GROUPINGS)[number]

export const DEFAULT_GROUPING: Grouping = "activity"

export const ACTIVITY_GROUPS = ["running", "needsYou", "today"] as const
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number]

type SectionHead = { readonly key: string; readonly items: readonly ExperimentSummary[] }

export type ListSection =
  | (SectionHead & { readonly kind: "activity"; readonly group: ActivityGroup })
  | (SectionHead & { readonly kind: "flow"; readonly flow: FlowId | null })
  | (SectionHead & { readonly kind: "failureMode"; readonly mode: string | null })

export type ListLayout = {
  readonly open: readonly ListSection[]
  readonly older: readonly ExperimentSummary[]
  readonly archived: readonly ExperimentSummary[]
}

type OpenLayout = Pick<ListLayout, "open" | "older">

type ActivityRule = { readonly group: ActivityGroup; readonly applies: (experiment: ExperimentSummary, dayStart: number) => boolean }

const NO_ACTIVITY = Number.NEGATIVE_INFINITY
const NO_EXPERIMENTS: readonly ExperimentSummary[] = []

export const activityTime = (experiment: ExperimentSummary): number => {
  const last = experiment.activity.last
  return last === null ? NO_ACTIVITY : Date.parse(last)
}

export const byActivity = (left: ExperimentSummary, right: ExperimentSummary): number =>
  activityTime(right) - activityTime(left) || left.id.localeCompare(right.id)

export const localDayStart = (now: Date): number => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

const ACTIVITY_RULES: readonly ActivityRule[] = [
  { group: "running", applies: (experiment) => experiment.activity.running },
  { group: "needsYou", applies: (experiment) => experiment.activity.attention.length > 0 },
  { group: "today", applies: (experiment, dayStart) => activityTime(experiment) >= dayStart },
]

export const activityGroupOf = (experiment: ExperimentSummary, dayStart: number): ActivityGroup | null =>
  ACTIVITY_RULES.find((rule) => rule.applies(experiment, dayStart))?.group ?? null

const byActivityGroup = (experiments: readonly ExperimentSummary[], dayStart: number): OpenLayout => ({
  open: ACTIVITY_GROUPS.map((group): ListSection => ({
    kind: "activity",
    key: `activity:${group}`,
    group,
    items: experiments.filter((experiment) => activityGroupOf(experiment, dayStart) === group),
  })).filter((section) => section.items.length > 0),
  older: experiments.filter((experiment) => activityGroupOf(experiment, dayStart) === null),
})

const byFlowGroup = (experiments: readonly ExperimentSummary[]): OpenLayout => ({
  open: groupByFlow(experiments, experimentFlow).map((group): ListSection => ({ kind: "flow", key: `flow:${group.flow ?? ""}`, flow: group.flow, items: group.items })),
  older: NO_EXPERIMENTS,
})

const modeRank = (mode: string | null): number => (mode === null ? 1 : 0)

const byModeName = (left: string | null, right: string | null): number => modeRank(left) - modeRank(right) || (left ?? "").localeCompare(right ?? "")

const byFailureModeGroup = (experiments: readonly ExperimentSummary[]): OpenLayout => ({
  open: [...new Set(experiments.map((experiment) => experiment.failureMode))].toSorted(byModeName).map((mode): ListSection => ({
    kind: "failureMode",
    key: `failureMode:${mode ?? ""}`,
    mode,
    items: experiments.filter((experiment) => experiment.failureMode === mode),
  })),
  older: NO_EXPERIMENTS,
})

const GROUPERS: Readonly<Record<Grouping, (experiments: readonly ExperimentSummary[], dayStart: number) => OpenLayout>> = {
  activity: byActivityGroup,
  flow: byFlowGroup,
  failureMode: byFailureModeGroup,
}

export const layoutExperiments = (experiments: readonly ExperimentSummary[], grouping: Grouping, dayStart: number): ListLayout => {
  const ordered = experiments.toSorted(byActivity)
  const active = ordered.filter((experiment) => !experiment.archived)
  return { ...GROUPERS[grouping](active, dayStart), archived: ordered.filter((experiment) => experiment.archived) }
}

export const isGrouping = (value: string): value is Grouping => GROUPINGS.some((grouping) => grouping === value)
