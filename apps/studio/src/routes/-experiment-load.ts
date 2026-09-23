import type { ExperimentArm, ExperimentDetail, FlowId, SeriesCaseRow, SeriesDetail, SeriesSummary } from "@/domain"
import type { LiveSources } from "@/data/live/sources"
import type { SubjectGraph } from "@/features/research"

export type LatestSeries = { readonly series: SeriesDetail; readonly disagreements: readonly SeriesCaseRow[] }

const NO_GRAPHS: readonly SubjectGraph[] = []
const DIVERGENT = { divergent: true }

const flowGraph = async (api: LiveSources, flowId: FlowId): Promise<SubjectGraph> => {
  const [detail, nodes] = await Promise.all([api.flow.detail(flowId), api.flow.nodes(flowId)])
  return { key: flowId, arm: null, nodes, order: detail.order }
}

const armGraph = async (api: LiveSources, experiment: ExperimentDetail, arm: ExperimentArm): Promise<SubjectGraph> => {
  const flow = await api.research.armFlow(experiment.id, arm.id)
  return { key: arm.id, arm: arm.id, nodes: flow.nodes, order: arm.steps.map((step) => step.node) }
}

const subjectGraphs = (api: LiveSources, experiment: ExperimentDetail): Promise<readonly SubjectGraph[]> => {
  const { subject } = experiment
  if (subject.kind !== "arm") return Promise.all([flowGraph(api, subject.flow), ...experiment.arms.map((arm) => armGraph(api, experiment, arm))])
  const ordered = [...experiment.arms.filter((arm) => arm.id === subject.arm), ...experiment.arms.filter((arm) => arm.id !== subject.arm)]
  return Promise.all(ordered.map((arm) => armGraph(api, experiment, arm)))
}

export const loadGraphs = (api: LiveSources, experiment: ExperimentDetail): Promise<readonly SubjectGraph[]> =>
  subjectGraphs(api, experiment).catch(() => NO_GRAPHS)

export const loadLatest = async (api: LiveSources, series: readonly SeriesSummary[]): Promise<LatestSeries | null> => {
  const [newest] = series
  if (newest === undefined) return null
  const [detail, disagreements] = await Promise.all([api.research.series(newest.id), api.research.seriesCases(newest.id, DIVERGENT)])
  return { series: detail, disagreements }
}
