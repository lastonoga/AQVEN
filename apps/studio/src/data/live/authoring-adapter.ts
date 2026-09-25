import type { components } from "@/api/schema"
import type {
  AuthoringDataset,
  AuthoringEvaluator,
  AuthoringFlow,
  AuthoringOptions,
  CaseCount,
  CaseSelectionDraft,
  CreatedExperiment,
  ExperimentSpecJson,
  SpecCheckJson,
  SpecGuardrailJson,
  SpecQuestionJson,
  SplitCounts,
  TagOptions,
  WriteDiagnostic,
  WrittenFile,
} from "@/domain"
import * as ids from "@/data/ids"

type S = components["schemas"]

const NO_CASES = 0

const DEFAULT_MARGIN = 0

const DEFAULT_REPEATS = 1

const splitsOf = (splits: Readonly<Record<string, number>>): SplitCounts => ({ dev: splits["dev"] ?? NO_CASES, holdout: splits["holdout"] ?? NO_CASES })

const byTag = (left: TagOptions, right: TagOptions): number => left.tag.localeCompare(right.tag)

const tagsOf = (tags: S["AuthoringDatasetView"]["tags"]): readonly TagOptions[] =>
  Object.entries(tags)
    .map(([tag, values]) => ({ tag, values: values.map(({ value, count }) => ({ value, count })) }))
    .sort(byTag)

const datasetOf = (dataset: S["AuthoringDatasetView"]): AuthoringDataset => ({
  id: ids.datasetId(dataset.dataset_id),
  flow: dataset.flow_id === null ? null : ids.flowId(dataset.flow_id),
  total: dataset.total,
  splits: splitsOf(dataset.splits),
  tags: tagsOf(dataset.tags),
})

const flowOf = (flow: S["AuthoringFlowView"]): AuthoringFlow => ({
  id: ids.flowId(flow.flow_id),
  description: flow.description,
  input: flow.input_type,
  output: flow.output_type,
  nodes: flow.nodes.map((node) => ({
    id: ids.nodeId(node.node_id),
    flowNode: ids.nodeId(node.flow_node_id),
    kind: node.kind,
    description: node.description,
    agent: node.agent_id === null ? null : ids.agentId(node.agent_id),
    inference: node.inference_id === null ? null : ids.inferenceId(node.inference_id),
    calls: node.calls === null ? null : ids.flowId(node.calls),
  })),
})

const evaluatorOf = (evaluator: S["EvaluatorOptionView"]): AuthoringEvaluator => ({
  use: evaluator.use,
  needsParams: evaluator.needs_params,
  description: evaluator.description,
  kind: evaluator.kind,
  params: evaluator.params.map(({ name, required }) => ({ name, required })),
})

export const authoringOptionsOf = (options: S["AuthoringOptionsView"]): AuthoringOptions => ({
  flows: options.flows.map(flowOf),
  agents: options.agents.map((agent) => ({ id: ids.agentId(agent.agent_id), model: agent.model })),
  datasets: options.datasets.map(datasetOf),
  evaluators: options.evaluators.map(evaluatorOf),
  questionKinds: options.question_kinds,
  metrics: options.metrics,
})

export const caseCountOf = (count: S["CaseCountView"]): CaseCount => ({ selected: count.selected, total: count.total, splits: splitsOf(count.splits) })

const diagnosticOf = (diagnostic: S["Diagnostic"]): WriteDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  file: diagnostic.file,
  path: diagnostic.path,
  message: diagnostic.message,
  line: diagnostic.line ?? null,
  hint: diagnostic.hint ?? null,
})

export const writtenFileOf = (written: S["ExperimentFileWritten"]): WrittenFile => ({
  file: ids.filePath(written.file),
  fileHash: ids.contentHash(written.file_hash),
  diagnostics: written.diagnostics.map(diagnosticOf),
})

export const createdExperimentOf = (created: S["ExperimentCreated"]): CreatedExperiment => ({
  ...writtenFileOf(created),
  experiment: ids.experimentId(created.experiment_id),
})

export const casesBody = (selection: CaseSelectionDraft): S["CaseSelection"] =>
  Object.keys(selection.tags).length === 0 ? { dataset: selection.dataset, tags: null } : { dataset: selection.dataset, tags: { ...selection.tags } }

const guardrailBody = (guardrail: SpecGuardrailJson): S["Guardrail"] => ({
  metric: guardrail.metric,
  margin: guardrail.margin,
  relative: guardrail.relative ?? false,
  ...(guardrail.direction === undefined ? {} : { direction: guardrail.direction }),
})

const questionBody = (question: SpecQuestionJson): S["Question"] => {
  if (question.kind === "look") return { kind: "look" }
  if (question.kind === "threshold") {
    return {
      kind: "threshold",
      metric: question.metric,
      margin: question.margin ?? DEFAULT_MARGIN,
      ...(question.variant === undefined ? {} : { variant: question.variant }),
      ...(question.below === undefined ? {} : { below: question.below }),
      ...(question.above === undefined ? {} : { above: question.above }),
    }
  }
  const pair = {
    baseline: question.baseline,
    candidate: question.candidate,
    primary: question.primary,
    margin: question.margin ?? DEFAULT_MARGIN,
    ...(question.direction === undefined ? {} : { direction: question.direction }),
    ...(question.guardrails === undefined ? {} : { guardrails: question.guardrails.map(guardrailBody) }),
  }
  return question.kind === "compare" ? { kind: "compare", ...pair } : { kind: "noninferior", ...pair }
}

const checkBody = (check: SpecCheckJson): S["ExperimentCheck"] => ({
  id: check.id,
  kind: check.kind,
  ...(check.use === undefined ? {} : { use: check.use }),
  ...(check.run === undefined ? {} : { run: check.run }),
  ...(check.inference === undefined ? {} : { inference: check.inference }),
  ...(check.agent === undefined ? {} : { agent: check.agent }),
  ...(check.with === undefined ? {} : { with: { ...check.with } }),
})

export const specBody = (spec: ExperimentSpecJson): S["ExperimentSpec"] => ({
  apiVersion: spec.apiVersion,
  kind: spec.kind,
  description: spec.description,
  archived: false,
  subject: { ...spec.subject },
  cases: { dataset: spec.cases.dataset, ...(spec.cases.tags === undefined ? {} : { tags: { ...spec.cases.tags } }) },
  variants: spec.variants.map((variant) => ({ id: variant.id, ...(variant.nodes === undefined ? {} : { nodes: { ...variant.nodes } }) })),
  question: questionBody(spec.question),
  plan: { repeats: spec.plan?.repeats ?? DEFAULT_REPEATS, ...(spec.plan?.cases === undefined ? {} : { cases: spec.plan.cases }) },
  ...(spec.failure_mode === undefined ? {} : { failure_mode: spec.failure_mode }),
  ...(spec.varies === undefined ? {} : { varies: { what: spec.varies.what, nodes: [...spec.varies.nodes] } }),
  ...(spec.checks === undefined ? {} : { checks: spec.checks.map(checkBody) }),
})
