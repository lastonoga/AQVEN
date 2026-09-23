import type { ApiExecution, ApiNode } from "@/domain"
import type { DatasetItem } from "./expected"

export type StepAgent = { readonly nodeId: string; readonly agent: string; readonly models: readonly string[] }

export type CompareAgentsTarget = {
  readonly flowId: string
  readonly step: string
  readonly runId: string
  readonly item: DatasetItem | null
  readonly agents: readonly StepAgent[]
}

const NESTED_SEPARATOR = "__"

const inStep = (nodeId: string, step: string): boolean => nodeId === step || nodeId.startsWith(`${step}${NESTED_SEPARATOR}`)

const modelsOf = (nodeId: string, executions: readonly ApiExecution[]): readonly string[] => [
  ...new Set(executions.flatMap((execution) => (execution.address.node_id === nodeId && execution.model !== null ? [execution.model] : []))),
]

export const stepAgents = (step: string, nodes: readonly ApiNode[], executions: readonly ApiExecution[]): readonly StepAgent[] =>
  nodes.flatMap((node) => {
    if (node.kind !== "llm" || node.agent === null || !inStep(node.node_id, step)) return []
    return [{ nodeId: node.node_id, agent: node.agent, models: modelsOf(node.node_id, executions) }]
  })

const agentLine = (agent: StepAgent): string =>
  agent.models.length === 0 ? `- ${agent.nodeId} uses agent ${agent.agent}` : `- ${agent.nodeId} uses agent ${agent.agent} (model ${agent.models.join(", ")})`

const casesLine = (item: DatasetItem | null, flowId: string): string =>
  item === null
    ? `Take the cases from a dataset of flow ${flowId}.`
    : `Take the cases from dataset ${item.datasetId}; this run used its case ${item.caseName}.`

export const compareAgentsPrompt = (target: CompareAgentsTarget): string => [
  `Write an experiment that compares agents on the step ${target.step} of flow ${target.flowId}.`,
  `I noticed it in run ${target.runId}.`,
  "The LLM nodes of this step and their current agents:",
  ...target.agents.map(agentLine),
  `Create experiments/<experiment_id>/experiment.yaml with apiVersion "aqven/v1" and kind "Experiment", subject flow ${target.flowId} from ${target.step} to ${target.step}.`,
  "Make the current agents the baseline variant and add candidate variants that override these nodes with other agents from agents/*.yaml.",
  casesLine(target.item, target.flowId),
  "Choose the checks, the question (compare or noninferior) and the plan, write experiment.md with the hypothesis, run aqven check and report the result in this chat.",
].join("\n")
