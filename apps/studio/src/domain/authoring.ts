import type { AgentId, ContentHash, DatasetId, ExperimentId, FilePath, FlowId, InferenceId, NodeId } from "./core"
import type { CaseTags, CheckKind, FactorKind, MetricDirection, QuestionKind, SplitCounts } from "./research"
import type { NodeKind, Severity } from "./vocabulary"

export type AuthoringNode = {
  readonly id: NodeId
  readonly flowNode: NodeId
  readonly kind: NodeKind
  readonly description: string
  readonly agent: AgentId | null
  readonly inference: InferenceId | null
  readonly calls: FlowId | null
}

export type AuthoringFlow = {
  readonly id: FlowId
  readonly description: string
  readonly input: string | null
  readonly output: string | null
  readonly nodes: readonly AuthoringNode[]
}

export type AuthoringAgent = { readonly id: AgentId; readonly model: string }

export type TagValueCount = { readonly value: string; readonly count: number }

export type TagOptions = { readonly tag: string; readonly values: readonly TagValueCount[] }

export type AuthoringDataset = {
  readonly id: DatasetId
  readonly flow: FlowId | null
  readonly total: number
  readonly splits: SplitCounts
  readonly tags: readonly TagOptions[]
}

export type EvaluatorParam = { readonly name: string; readonly required: boolean }

export type AuthoringEvaluator = {
  readonly use: string
  readonly needsParams: boolean
  readonly description: string
  readonly kind: CheckKind
  readonly params: readonly EvaluatorParam[]
}

export type AuthoringOptions = {
  readonly flows: readonly AuthoringFlow[]
  readonly agents: readonly AuthoringAgent[]
  readonly datasets: readonly AuthoringDataset[]
  readonly evaluators: readonly AuthoringEvaluator[]
  readonly questionKinds: readonly QuestionKind[]
  readonly metrics: readonly string[]
}

export type CaseSelectionDraft = { readonly dataset: DatasetId; readonly tags: CaseTags }

export type CaseCount = { readonly selected: number; readonly total: number; readonly splits: SplitCounts }

export type WriteDiagnostic = {
  readonly code: string
  readonly severity: Severity
  readonly file: string
  readonly path: readonly (string | number)[]
  readonly message: string
  readonly line: number | null
  readonly hint: string | null
}

export type WrittenFile = {
  readonly file: FilePath
  readonly fileHash: ContentHash
  readonly diagnostics: readonly WriteDiagnostic[]
}

export type CreatedExperiment = WrittenFile & { readonly experiment: ExperimentId }

export type SpecSubjectJson = { readonly flow: string; readonly from?: string; readonly to?: string }

export type SpecFactorJson = { readonly what: FactorKind; readonly nodes: readonly string[] }

export type SpecCasesJson = { readonly dataset: string; readonly tags?: Readonly<Record<string, string>> }

export type SpecVariantJson = { readonly id: string; readonly nodes?: Readonly<Record<string, string>> }

export type SpecCheckJson = {
  readonly id: string
  readonly kind: CheckKind
  readonly use?: string
  readonly run?: string
  readonly inference?: string
  readonly agent?: string
  readonly with?: Readonly<Record<string, unknown>>
}

export type SpecGuardrailJson = {
  readonly metric: string
  readonly direction?: MetricDirection
  readonly margin: number
  readonly relative?: boolean
}

export type SpecQuestionJson =
  | { readonly kind: "look" }
  | {
      readonly kind: "threshold"
      readonly metric: string
      readonly variant?: string
      readonly below?: number
      readonly above?: number
      readonly margin?: number
    }
  | {
      readonly kind: "compare" | "noninferior"
      readonly baseline: string
      readonly candidate: string
      readonly primary: string
      readonly direction?: MetricDirection
      readonly margin?: number
      readonly guardrails?: readonly SpecGuardrailJson[]
    }

export type SpecPlanJson = { readonly cases?: number; readonly repeats?: number }

export type ExperimentSpecJson = {
  readonly apiVersion: "aqven/v1"
  readonly kind: "Experiment"
  readonly description: string
  readonly failure_mode?: string
  readonly subject: SpecSubjectJson
  readonly varies?: SpecFactorJson
  readonly cases: SpecCasesJson
  readonly variants: readonly SpecVariantJson[]
  readonly checks?: readonly SpecCheckJson[]
  readonly question: SpecQuestionJson
  readonly plan?: SpecPlanJson
}

export type ExperimentCreate = {
  readonly experiment: ExperimentId
  readonly spec: ExperimentSpecJson
  readonly prompts: Readonly<Record<string, string>>
}
