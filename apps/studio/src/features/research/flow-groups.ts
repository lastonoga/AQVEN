import type { ExperimentSubject, ExperimentSummary, FlowId } from "@/domain"

export type FlowGroup<T> = { readonly flow: FlowId | null; readonly items: readonly T[] }

const LOCAL_LAST = 1
const FLOWS_FIRST = 0
const LOCAL_KEY = ""

const flowRank = (flow: FlowId | null): number => (flow === null ? LOCAL_LAST : FLOWS_FIRST)

const byFlowName = (left: FlowId | null, right: FlowId | null): number =>
  flowRank(left) - flowRank(right) || (left ?? "").localeCompare(right ?? "")

export const groupByFlow = <T>(items: readonly T[], flowOf: (item: T) => FlowId | null): readonly FlowGroup<T>[] =>
  [...new Set(items.map(flowOf))].toSorted(byFlowName).map((flow) => ({ flow, items: items.filter((item) => flowOf(item) === flow) }))

export const flowGroupKey = (group: FlowGroup<unknown>): string => group.flow ?? LOCAL_KEY

export const subjectFlow = (subject: ExperimentSubject): FlowId | null => (subject.local ? null : subject.flow)

export const experimentFlow = (experiment: ExperimentSummary): FlowId | null => subjectFlow(experiment.subject)
