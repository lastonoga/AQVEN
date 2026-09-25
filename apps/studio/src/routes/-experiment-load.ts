import type { ExperimentDetail, ExperimentId, FlowId, SeriesCaseRow, SeriesDetail, SeriesSummary } from "@/domain"
import * as ids from "@/data/ids"
import type { LiveSources } from "@/data/live/sources"
import { stepSchemas } from "@/features/flow"
import type { SubjectGraph } from "@/features/research"

export type LatestSeries = { readonly series: SeriesDetail; readonly disagreements: readonly SeriesCaseRow[] }

const NO_GRAPHS: readonly SubjectGraph[] = []
const DIVERGENT = { divergent: true }

const flowGraph = async (api: LiveSources, flowId: FlowId): Promise<SubjectGraph> => {
  const [detail, nodes, schemas] = await Promise.all([api.flow.detail(flowId), api.flow.nodes(flowId), api.flow.schemas(flowId)])
  return { key: flowId, flow: flowId, local: false, nodes, order: detail.order, schemas: stepSchemas(schemas), prompts: { kind: "flow", flow: flowId } }
}

const localGraph = async (api: LiveSources, experiment: ExperimentId, flowId: FlowId): Promise<SubjectGraph> => {
  const flow = await api.research.experimentFlow(experiment, flowId)
  return {
    key: flowId,
    flow: flowId,
    local: true,
    nodes: flow.nodes,
    order: flow.order,
    schemas: stepSchemas(flow.schemas),
    prompts: { kind: "local", prompts: flow.prompts },
  }
}

const isLocal = (experiment: ExperimentDetail, flow: FlowId): boolean => experiment.flows.some((item) => item.id === flow)

const calledFlows = (experiment: ExperimentDetail): readonly FlowId[] =>
  experiment.variants.flatMap((variant) => variant.changes.flatMap((change) => (change.what === "flow" ? [ids.flowId(change.value)] : [])))

const shownFlows = (experiment: ExperimentDetail): readonly FlowId[] =>
  [...new Set([experiment.subject.flow, ...experiment.flows.map((flow) => flow.id), ...calledFlows(experiment)])]

const graphOf = (api: LiveSources, experiment: ExperimentDetail) => (flow: FlowId): Promise<SubjectGraph> =>
  isLocal(experiment, flow) ? localGraph(api, experiment.id, flow) : flowGraph(api, flow)

const subjectGraphs = (api: LiveSources, experiment: ExperimentDetail): Promise<readonly SubjectGraph[]> =>
  Promise.all(shownFlows(experiment).map(graphOf(api, experiment)))

export const loadGraphs = (api: LiveSources, experiment: ExperimentDetail): Promise<readonly SubjectGraph[]> =>
  subjectGraphs(api, experiment).catch(() => NO_GRAPHS)

export const loadLatest = async (api: LiveSources, series: readonly SeriesSummary[]): Promise<LatestSeries | null> => {
  const [newest] = series
  if (newest === undefined) return null
  const [detail, disagreements] = await Promise.all([api.research.series(newest.id), api.research.seriesCases(newest.id, DIVERGENT)])
  return { series: detail, disagreements }
}
