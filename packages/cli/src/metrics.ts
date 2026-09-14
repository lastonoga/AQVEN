import { isRecord, numberAt } from "./ir-types.js"

export const CHARS_PER_TOKEN = 3
export const BUDGET_TOKENS = 4000
export const DEFAULT_NODE_MICROS = 2000

export type Tokens = { input: number; output: number; total: number }

export type NodeMetrics = {
  tokens: Tokens
  usdMicros: number
  costUsd: number
  model: string | null
  provider: string | null
  attempt: number
  priced: boolean
}

export type MetricsRequest = {
  kind: string
  node: Record<string, unknown>
  flowBudget: unknown
  nodeCount: number
  prompt: string | null
  inputs: unknown
  output: unknown
  attempt: number
}

const PRICED_KINDS = new Set(["llm", "call", "map", "parallel", "loop"])

const PROVIDERS: readonly { match: RegExp; name: string }[] = [
  { match: /openai|gpt/i, name: "openai" },
  { match: /anthropic|claude/i, name: "anthropic" },
  { match: /google|gemini/i, name: "google" },
  { match: /qwen/i, name: "qwen" },
  { match: /mistral/i, name: "mistral" },
  { match: /cohere/i, name: "cohere" },
  { match: /llama|meta/i, name: "meta" },
  { match: /deepseek/i, name: "deepseek" },
]

const UNKNOWN_PROVIDER = "роль без семейства"

const jsonLength = (value: unknown): number => (JSON.stringify(value ?? null) ?? "null").length

const tokensOf = (chars: number): number => (chars === 0 ? 0 : Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN)))

const budgetMicrosOf = (value: unknown): number | null => (isRecord(value) ? numberAt(value, "usdMicros") : null)

export const nodeBudgetMicros = (request: MetricsRequest): number | null =>
  budgetMicrosOf(request.node["budget"])

const shareOfFlowBudget = (request: MetricsRequest): number | null => {
  const flow = budgetMicrosOf(request.flowBudget)
  if (flow === null) return null
  return Math.round(flow / Math.max(request.nodeCount, 1))
}

const allowanceOf = (request: MetricsRequest): number =>
  nodeBudgetMicros(request) ?? shareOfFlowBudget(request) ?? DEFAULT_NODE_MICROS

const modelRoleOf = (node: Record<string, unknown>): string | null => {
  const role = node["modelRole"]
  return typeof role === "string" && role !== "" ? role : null
}

export const providerOf = (role: string | null): string | null => {
  if (role === null) return null
  return PROVIDERS.find((candidate) => candidate.match.test(role))?.name ?? UNKNOWN_PROVIDER
}

export function estimateMetrics(request: MetricsRequest): NodeMetrics {
  const inputChars = jsonLength(request.inputs) + (request.prompt?.length ?? 0)
  const input = tokensOf(inputChars)
  const output = tokensOf(jsonLength(request.output))
  const total = input + output

  const priced = PRICED_KINDS.has(request.kind) || nodeBudgetMicros(request) !== null
  const allowance = allowanceOf(request)
  const usdMicros = priced ? Math.min(allowance, Math.ceil((allowance * total) / BUDGET_TOKENS)) : 0
  const role = modelRoleOf(request.node)

  return {
    tokens: { input, output, total },
    usdMicros,
    costUsd: usdMicros / 1_000_000,
    model: role,
    provider: providerOf(role),
    attempt: request.attempt,
    priced,
  }
}

export const metricsNotes = (metrics: NodeMetrics, request: MetricsRequest): string[] => {
  const allowance = allowanceOf(request)
  const cost = metrics.priced
    ? `стоимость оценена по бюджету узла: ${allowance} usdMicros на ${BUDGET_TOKENS} токенов, списания не было`
    : "стоимость не считается: узел не обращается к модели"
  const model =
    metrics.model === null
      ? "модель узлу не назначена: узел не обращается к провайдеру"
      : `модель не выбиралась: показана роль «${metrics.model}», семейство «${metrics.provider}» выведено из имени роли`
  return [
    `метрики оценены, а не измерены: токены посчитаны по длине входа и выхода (${CHARS_PER_TOKEN} знака на токен)`,
    cost,
    model,
    `попытка ${metrics.attempt}: ретраи выключены, повторов не было`,
  ]
}
