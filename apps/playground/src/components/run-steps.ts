import { resolveSlot } from "../refs/index.js"
import { isRecord } from "./ir-value.js"
import type { Ir, Render, Run, RunEvent } from "../api/index.js"
import type { RunSnapshot, SlotProvenance } from "../refs/index.js"
import type { NodeProgress, NodeStatus, RunNodeView, RunView } from "../run/events.js"

export type StepMetrics = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
}

export type StepCheck = { name: string; ok: boolean | null; message: string }

export type StepBadge = { label: string; title: string }

export type RunStep = {
  index: number
  nodeId: string
  kind: string
  description: string | null
  status: NodeStatus
  startedAt: number | null
  durationMs: number | null
  progress: NodeProgress | null
  slots: Record<string, unknown> | null
  input: unknown
  output: unknown
  outputType: string | null
  prompt: string | null
  rawResponse: string | null
  checks: StepCheck[]
  metrics: StepMetrics
  badges: StepBadge[]
  simplifications: string[]
  error: string | null
  signature: string
}

export type StepSlot = {
  name: string
  raw: unknown
  provenance: SlotProvenance | null
  type: string
  value: unknown
  known: boolean
}

const EMPTY_METRICS: StepMetrics = { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }

const recordOf = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null)

const payloadsOf = (events: readonly RunEvent[]): Record<string, unknown>[] =>
  events.map((event) => recordOf(event.payload)).filter((payload): payload is Record<string, unknown> => payload !== null)

const pickString = (sources: readonly Record<string, unknown>[], keys: readonly string[]): string | null => {
  const found = sources.flatMap((source) => keys.map((key) => source[key])).find((value) => typeof value === "string")
  return typeof found === "string" && found !== "" ? found : null
}

const pickNumber = (source: Record<string, unknown> | null, keys: readonly string[]): number | null => {
  if (source === null) return null
  const found = keys.map((key) => source[key]).find((value) => typeof value === "number")
  return typeof found === "number" ? found : null
}

const pickNested = (
  sources: readonly Record<string, unknown>[],
  keys: readonly string[],
): Record<string, unknown> | null =>
  sources.flatMap((source) => keys.map((key) => recordOf(source[key]))).find((found) => found !== null) ?? null

const numberFrom = (sources: readonly Record<string, unknown>[], keys: readonly string[]): number | null => {
  const found = sources.map((source) => pickNumber(source, keys)).find((value) => value !== null)
  return found ?? null
}

const INPUT_TOKEN_KEYS = ["input", "in", "prompt", "promptTokens", "inputTokens"]
const OUTPUT_TOKEN_KEYS = ["output", "out", "completion", "completionTokens", "outputTokens"]
const TOTAL_TOKEN_KEYS = ["total", "totalTokens", "tokens"]
const USD_KEYS = ["costUsd", "usd", "cost"]
const MICROS_KEYS = ["usdMicros", "costUsdMicros", "micros"]

const costOf = (sources: readonly Record<string, unknown>[]): number | null => {
  const cost = pickNested(sources, ["cost", "price", "budget"])
  const usd = numberFrom(sources, USD_KEYS) ?? pickNumber(cost, USD_KEYS)
  if (usd !== null) return usd
  const micros = numberFrom(sources, MICROS_KEYS) ?? pickNumber(cost, MICROS_KEYS)
  if (micros === null) return null
  return micros / 1_000_000
}

const metricsOf = (sources: readonly Record<string, unknown>[]): StepMetrics => {
  const tokens = pickNested(sources, ["tokens", "usage"])
  const totalDeclared = pickNumber(tokens, TOTAL_TOKEN_KEYS) ?? numberFrom(sources, ["totalTokens"])
  const inputTokens = pickNumber(tokens, INPUT_TOKEN_KEYS) ?? numberFrom(sources, ["inputTokens", "promptTokens"])
  const outputTokens = pickNumber(tokens, OUTPUT_TOKEN_KEYS) ?? numberFrom(sources, ["outputTokens", "completionTokens"])
  const summed = inputTokens === null && outputTokens === null ? null : (inputTokens ?? 0) + (outputTokens ?? 0)
  return { inputTokens, outputTokens, totalTokens: totalDeclared ?? summed, costUsd: costOf(sources) }
}

const CHECK_NAME_KEYS = ["name", "label", "id", "rule", "check"]
const CHECK_MESSAGE_KEYS = ["message", "reason", "detail", "details", "text"]
const OK_STATUSES = new Set(["ok", "pass", "passed", "valid", "true"])
const FAIL_STATUSES = new Set(["fail", "failed", "error", "invalid", "false"])

const okOf = (source: Record<string, unknown>): boolean | null => {
  const flag = ["ok", "passed", "valid", "success"].map((key) => source[key]).find((value) => typeof value === "boolean")
  if (typeof flag === "boolean") return flag
  const status = pickString([source], ["status", "result", "verdict"])
  if (status === null) return null
  if (OK_STATUSES.has(status.toLowerCase())) return true
  if (FAIL_STATUSES.has(status.toLowerCase())) return false
  return null
}

const checkOf = (value: unknown, index: number): StepCheck | null => {
  const source = recordOf(value)
  if (source === null) return null
  return {
    name: pickString([source], CHECK_NAME_KEYS) ?? `проверка ${index + 1}`,
    ok: okOf(source),
    message: pickString([source], CHECK_MESSAGE_KEYS) ?? "",
  }
}

const checksOf = (sources: readonly Record<string, unknown>[]): StepCheck[] => {
  const raw = sources
    .flatMap((source) => ["checks", "validations", "verifications", "guards"].map((key) => source[key]))
    .find((value) => Array.isArray(value))
  if (!Array.isArray(raw)) return []
  return raw.map(checkOf).filter((check): check is StepCheck => check !== null)
}

const badgeRules: readonly { match: RegExp; label: string }[] = [
  { match: /последовательн/i, label: "исполнено последовательно" },
  { match: /ретра/i, label: "ретраи выключены" },
  { match: /сгенерирован по тип|заполнена заглушкой|заменён заглушкой|заглушками/i, label: "ответ сгенерирован по схеме" },
  { match: /промт собран/i, label: "промт собран заглушкой" },
  { match: /не раскрыт/i, label: "компонент не раскрыт" },
  { match: /выбрана первая ветка|ветка switch|исполнен безусловно/i, label: "ветки без условий" },
  { match: /таймаут/i, label: "таймаут не применяется" },
  { match: /бюджет/i, label: "бюджет не учитывается" },
  { match: /контракт выхода/i, label: "выход не проверен" },
  { match: /довери/i, label: "доверие не проверено" },
  { match: /полити/i, label: "политики выключены" },
  { match: /defaults не применяются/i, label: "defaults не применяются" },
  { match: /контекст/i, label: "контекст не собран" },
  { match: /кэш|ttl/i, label: "кэш не используется" },
  { match: /лимит плейграунда|обработано \d+ элемент/i, label: "часть элементов" },
  { match: /maxItems/i, label: "лимит элементов не проверен" },
  { match: /цикл в графе/i, label: "цикл развёрнут в порядок" },
  { match: /эффект/i, label: "эффект не выполнялся" },
  { match: /чистота функции/i, label: "чистота не проверена" },
  { match: /onTimeout|недостижима/i, label: "ветка таймаута недостижима" },
  { match: /условие .* не вычислял/i, label: "условие не вычислялось" },
  { match: /тип выхода .* не указан/i, label: "тип выхода не объявлен" },
]

const LABEL_CHARS = 30

const clipped = (text: string): string =>
  text.length <= LABEL_CHARS ? text : `${text.slice(0, LABEL_CHARS - 1)}…`

const labelOf = (text: string): string => badgeRules.find((rule) => rule.match.test(text))?.label ?? clipped(text)

export const stepBadges = (simplifications: readonly string[]): StepBadge[] => {
  const grouped = new Map<string, string[]>()
  for (const text of simplifications) {
    const label = labelOf(text)
    grouped.set(label, [...(grouped.get(label) ?? []), text])
  }
  return [...grouped.entries()].map(([label, items]) => ({ label, title: items.join("\n") }))
}

const promptOf = (render: Render | undefined, sources: readonly Record<string, unknown>[]): string | null =>
  render?.prompt ?? pickString(sources, ["prompt", "renderedPrompt"])

const rawOf = (sources: readonly Record<string, unknown>[]): string | null =>
  pickString(sources, ["raw", "rawResponse", "rawText", "responseText", "completion"])

const signatureOf = (node: RunNodeView, render: Render | undefined): string =>
  [
    node.status,
    String(node.durationMs),
    String(node.events.length),
    String(node.progress?.index ?? ""),
    render === undefined ? "0" : "1",
  ].join("|")

const stepOf = (node: RunNodeView, index: number, render: Render | undefined): RunStep => {
  const sources = payloadsOf(node.events)
  return {
    index: index + 1,
    nodeId: node.nodeId,
    kind: node.kind ?? "node",
    description: node.description,
    status: node.status,
    startedAt: node.startedAt,
    durationMs: node.durationMs,
    progress: node.progress,
    slots: node.slots,
    input: node.input ?? render?.input,
    output: node.output ?? render?.output,
    outputType: node.outputType,
    prompt: promptOf(render, sources),
    rawResponse: rawOf(sources),
    checks: checksOf(sources),
    metrics: node.events.length === 0 ? EMPTY_METRICS : metricsOf(sources),
    badges: stepBadges(node.simplifications),
    simplifications: node.simplifications,
    error: node.error,
    signature: signatureOf(node, render),
  }
}

export const buildSteps = (view: RunView, renders: Readonly<Record<string, Render>>): RunStep[] =>
  [...view.nodes]
    .sort((a, b) => a.order - b.order)
    .map((node, index) => stepOf(node, index, renders[node.nodeId]))

export const stepSnapshot = (run: Run | null, renders: Readonly<Record<string, Render>>): RunSnapshot | null => {
  if (run === null) return null
  return { input: run.input, renders }
}

const slotOf = (
  name: string,
  raw: unknown,
  recorded: Record<string, unknown>,
  step: RunStep,
  ir: Ir | null,
  run: RunSnapshot | null,
): StepSlot => {
  const provenance = raw === undefined || ir === null ? null : resolveSlot(name, raw, ir, run, { nodeId: step.nodeId })
  const recordedHere = name in recorded
  const resolved = provenance?.value ?? null
  return {
    name,
    raw,
    provenance,
    type: provenance?.origin?.type ?? "",
    value: recordedHere ? recorded[name] : resolved?.value,
    known: recordedHere || resolved !== null,
  }
}

export const stepSlots = (step: RunStep, ir: Ir | null, run: RunSnapshot | null): StepSlot[] => {
  const recorded = recordOf(step.input) ?? {}
  const declared = step.slots ?? {}
  const names = [...new Set([...Object.keys(declared), ...Object.keys(recorded)])]
  return names.map((name) => slotOf(name, declared[name], recorded, step, ir, run))
}

const ru = new Intl.NumberFormat("ru-RU")

export const formatTokens = (value: number | null): string => (value === null ? "—" : ru.format(value))

export const formatUsd = (value: number | null): string => {
  if (value === null) return "—"
  if (value === 0) return "$0"
  return `$${value < 1 ? value.toFixed(4) : value.toFixed(2)}`
}
