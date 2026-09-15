export type FlowItemKind = "step" | "branch" | "iteration" | "gate"

export type FlowMode = "sequence" | "parallel" | "loop"

export type FlowCheck = { name: string; ok: boolean | null; message: string }

export type FlowItem = {
  id: string
  kind: FlowItemKind
  nodeId: string
  order: number
  title: string
  note: string
  nodeKind: string
  status: "pending" | "running" | "ok" | "error" | "skipped"
  offsetMs: number | null
  durationMs: number | null
  totalTokens: number | null
  costUsd: number | null
  model: string | null
  params: Readonly<Record<string, unknown>> | null
  input: unknown
  prompt: string | null
  output: unknown
  outputType: string | null
  checks: readonly FlowCheck[]
  error: string | null
  score: number | null
  selected: boolean
  stopReason: string | null
  groups: readonly FlowGroup[]
}

export type FlowGroup = {
  id: string
  mode: FlowMode
  label: string
  offsetMs: number | null
  durationMs: number | null
  lanes: number
  items: readonly FlowItem[]
}

export type FlowTree = {
  groups: readonly FlowGroup[]
  startedAt: number | null
  durationMs: number | null
}

const ru = new Intl.NumberFormat("ru-RU")

export const formatOffset = (ms: number | null): string => {
  if (ms === null) return ""
  if (ms < 1000) return `+${ms} мс`
  return `+${(ms / 1000).toFixed(2)} с`
}

export const formatSpan = (ms: number | null): string => {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms} мс`
  return `${(ms / 1000).toFixed(2)} с`
}

export const formatMoney = (value: number | null): string => {
  if (value === null) return ""
  if (value === 0) return "$0"
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

export const formatCount = (value: number | null): string => (value === null ? "" : ru.format(value))

const plural = (count: number, one: string, few: string, many: string): string => {
  const tail = count % 10
  const teen = count % 100
  if (teen >= 11 && teen <= 14) return many
  if (tail === 1) return one
  if (tail >= 2 && tail <= 4) return few
  return many
}

export const branchWord = (count: number): string => plural(count, "ветка", "ветки", "веток")

export const iterationWord = (count: number): string => plural(count, "итерация", "итерации", "итераций")

export const stepWord = (count: number): string => plural(count, "шаг", "шага", "шагов")

const failedIn = (item: FlowItem): number => item.checks.filter((check) => check.ok === false).length

export const failedChecks = (item: FlowItem): number =>
  failedIn(item) + item.groups.reduce((total, group) => total + group.items.reduce((sum, child) => sum + failedChecks(child), 0), 0)

export const countItems = (group: FlowGroup): number =>
  group.items.reduce((total, item) => total + 1 + item.groups.reduce((sum, child) => sum + countItems(child), 0), 0)

export const totalCost = (group: FlowGroup): number | null => {
  const values = group.items.flatMap((item) => [
    item.costUsd,
    ...item.groups.map((child) => totalCost(child)),
  ])
  const known = values.filter((value): value is number => value !== null)
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0)
}
