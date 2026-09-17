import type { DatasetId, DatasetSource, DatasetSummary, StageShape, TestScope } from "@/domain"
import { runRef, score } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type MetaParts = readonly string[]
export type ScopeView = { readonly title: MetaParts; readonly subtitle: MetaParts }

type ScopeKind = TestScope["kind"]
type ScopeOf<K extends ScopeKind> = Extract<TestScope, { readonly kind: K }>
type ShapeKind = StageShape["kind"]
type ShapeOf<K extends ShapeKind> = Extract<StageShape, { readonly kind: K }>
type SourceKind = DatasetSource["kind"]
type SourceOf<K extends SourceKind> = Extract<DatasetSource, { readonly kind: K }>

const stageNumber = (stage: number, t: Translator<"tests">): string => t("scope.stageNumber", { value: stage })

const STAGE_SHAPE: { readonly [K in ShapeKind]: (shape: ShapeOf<K>, t: Translator<"tests">) => string } = {
  parallel: (shape, t) => t("scope.parallel", { count: shape.branches }),
  loop: (shape, t) => t("scope.loop", { threshold: score(shape.threshold) }),
}

export const presentStageShape = <K extends ShapeKind>(shape: ShapeOf<K>, t: Translator<"tests">): string => {
  const present: (shape: ShapeOf<K>, t: Translator<"tests">) => string = STAGE_SHAPE[shape.kind]
  return present(shape, t)
}

const TEST_SCOPE: { readonly [K in ScopeKind]: (scope: ScopeOf<K>, t: Translator<"tests">) => ScopeView } = {
  call: (scope, t) => ({
    title: [scope.nodeId],
    subtitle: [t("scope.call"), stageNumber(scope.stage, t), scope.role],
  }),
  stage: (scope, t) => ({
    title: [scope.name, stageNumber(scope.stage, t)],
    subtitle: [t("scope.stage"), presentStageShape(scope.shape, t)],
  }),
  workflow: (scope, t) => ({
    title: [t("scope.workflowTitle")],
    subtitle: [t("scope.workflowSubtitle", { text: scope.entryNodeId })],
  }),
}

export const presentScope = <K extends ScopeKind>(scope: ScopeOf<K>, t: Translator<"tests">): ScopeView => {
  const present: (scope: ScopeOf<K>, t: Translator<"tests">) => ScopeView = TEST_SCOPE[scope.kind]
  return present(scope, t)
}

const DATASET_SOURCE: { readonly [K in SourceKind]: (source: SourceOf<K>, t: Translator<"tests">) => MetaParts } = {
  spreadsheet: (source, t) => [t(source.agentExtended ? "datasets.source.spreadsheetAgentExtended" : "datasets.source.spreadsheet")],
  agent: (source, t) => [t("datasets.source.agent"), t("datasets.source.agentRuns", { from: runRef(source.fromRun), to: runRef(source.toRun) })],
  tool: (source, t) => [t("datasets.source.tool", { text: source.adapter }), t("datasets.source.snapshot")],
  manual: (_source, t) => [t("datasets.source.manual")],
}

export const presentSource = <K extends SourceKind>(source: SourceOf<K>, t: Translator<"tests">): MetaParts => {
  const present: (source: SourceOf<K>, t: Translator<"tests">) => MetaParts = DATASET_SOURCE[source.kind]
  return present(source, t)
}

export const datasetRowCounts = (datasets: readonly DatasetSummary[]): ReadonlyMap<DatasetId, number> =>
  new Map(datasets.map((dataset) => [dataset.id, dataset.rowCount]))

export const presentDatasetRef = (id: DatasetId, rowCounts: ReadonlyMap<DatasetId, number>, t: Translator<"tests">): MetaParts => {
  const rowCount = rowCounts.get(id)
  if (rowCount === undefined) return [id]
  return [id, t("rows", { count: rowCount })]
}

export const presentDatasetSummary = (dataset: DatasetSummary, t: Translator<"tests">): MetaParts => [
  t("rows", { count: dataset.rowCount }),
  dataset.description,
]
