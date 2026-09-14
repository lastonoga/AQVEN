import { randomUUID } from "node:crypto"
import { makeMedia, mimeOfName } from "./media.js"
import { fnv1a, hex6, hex8, mulberry32, pickFrom, round2 } from "./random.js"
import { RunClock } from "./clock.js"
import { pooled, runByReadiness } from "./scheduler.js"
import { typeValue, SOURCE_NOTES } from "./type-values.js"
import { estimateMetrics, metricsNotes, nodeBudgetMicros } from "./metrics.js"
import { checksOf } from "./checks.js"
import { plural, summaryOf } from "./summary.js"
import type { Ir } from "@wf/synth"
import type { MediaContext, MediaEnvelope } from "./media.js"
import type { TypeCatalog } from "./ir-types.js"
import type { TypeSource } from "./type-values.js"
import type { MetricsRequest, NodeMetrics } from "./metrics.js"
import type { Check } from "./checks.js"
import type { Run, RunEvent, RunStatus, ServerEvent } from "./events.js"
import type { RunsRepository } from "./runs-db.js"

export const MAP_ITEMS = 3
export const MIN_DELAY_MS = 150
export const MAX_DELAY_MS = 400
export const PREVIEW_CHARS = 400
export const NODE_CONCURRENCY = 4
export const LOOP_ITERATIONS = 3
export const LOOP_THRESHOLD = 0.8
export const RAW_CHARS = 4000

export type IrNode = Record<string, unknown>
export type Publish = (event: ServerEvent) => void

export type NodeTiming = { startedAt: number; endedAt: number; ms: number }

export type InputField = {
  path: string
  usedBy: { node: string; slot: string }[]
}

export type InputSchema = {
  flow: string
  type: string
  root: string
  freeform: true
  fields: InputField[]
  context: string[]
  example: unknown
  note: string
}

type Scope = { input: unknown; values: Record<string, unknown> }

type RenderPart = {
  branchKey?: string
  iteration?: number
  input: unknown
  output: unknown
  prompt: string | null
}

type HandlerContext = {
  nodeId: string
  node: IrNode
  ir: Ir
  catalog: TypeCatalog
  scope: Scope
  inputs: Record<string, unknown>
  required: string[][]
  media: MediaContext
  timings: Readonly<Record<string, NodeTiming>>
  emit: (type: string, payload: Record<string, unknown>) => void
  progress: (payload: Record<string, unknown>) => void
  saveRender: (part: RenderPart) => void
}

type HandlerResult = {
  output: unknown
  outputType: string
  source: TypeSource
  prompt: string | null
  facts: string[]
  simplifications: string[]
}

type Handler = (ctx: HandlerContext) => Promise<HandlerResult>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const isRef = (v: unknown): v is string => typeof v === "string" && v.startsWith("$")

const numberOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

const segmentsOf = (ref: string): string[] =>
  ref
    .slice(1)
    .split(/[.[]/)
    .map((s) => s.replace(/\]$/, ""))
    .filter((s) => s.length > 0)

const stepInto = (value: unknown, seg: string): unknown => {
  if (seg === "*") return Array.isArray(value) ? value.flat() : []
  if (Array.isArray(value)) return value.map((v) => stepInto(v, seg))
  if (!isRecord(value)) return undefined
  return value[seg]
}

const resolveRef = (ref: string, scope: Scope): unknown => {
  const path = segmentsOf(ref)
  const head = path[0]
  if (head === undefined) return scope.input
  const base = head in scope.values ? scope.values[head] : scope.input
  return path.slice(1).reduce(stepInto, base)
}

const resolveValue = (value: unknown, scope: Scope): unknown => {
  if (isRef(value)) return resolveRef(value, scope)
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope))
  if (isRecord(value) && "const" in value) return value["const"]
  if (isRecord(value) && typeof value["node"] === "string") return stepInto(scope.values[value["node"]], "out")
  return value
}

const resolveSlots = (slots: unknown, scope: Scope): Record<string, unknown> => {
  if (!isRecord(slots)) return {}
  return Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, resolveValue(v, scope)]))
}

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value ?? null) ?? "null"
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`
}

const NOUNS = ["вариант", "черновик", "подборка", "сводка", "предложение", "разбор", "заметка", "набор"]
const ADJECTIVES = ["короткий", "точный", "спорный", "проверенный", "черновой", "сильный", "нейтральный"]
const TAILS = ["по заявке", "по трём отелям", "по фильтрам", "для менеджера", "для клиента", "без правок"]

const sentence = (seed: string): string =>
  `${pickFrom(ADJECTIVES, `${seed}|a`, "черновой")} ${pickFrom(NOUNS, `${seed}|n`, "вариант")} ${pickFrom(TAILS, `${seed}|t`, "по заявке")}`

const snake = (name: string): string =>
  name.replace(/\[\]$/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

export type Stub = {
  seed: string
  emit: (mime: string, label: string) => MediaEnvelope
  media: MediaContext
}

const stubOf = (seed: string, media: MediaContext): Stub => {
  let issued = 0
  return {
    seed,
    media,
    emit: (mime, label) => {
      issued += 1
      const id = hex8(`${seed}|${label}|${issued}`)
      return makeMedia(media, id, mime, label, mulberry32(fnv1a(id)))
    },
  }
}

type ScalarRule = {
  match: (key: string, raw: string) => boolean
  make: (stub: Stub, key: string, raw: string) => unknown
}

const SCALAR_RULES: ScalarRule[] = [
  { match: (k) => k.endsWith("id"), make: (s, k) => `${snake(k)}-${hex6(`${s.seed}|${k}`)}` },
  { match: (k) => k.includes("score") || k.includes("rating") || k.includes("confidence"), make: (s, k) => round2(fnv1a(`${s.seed}|${k}`) / 4294967296) },
  { match: (k) => k.includes("count") || k.includes("index") || k.includes("total"), make: (s, k) => 1 + (fnv1a(`${s.seed}|${k}`) % 9) },
  { match: (k) => k.includes("decision") || k.includes("verdict"), make: () => "accept" },
  { match: (k) => k.startsWith("is") || k.startsWith("has"), make: (s, k) => fnv1a(`${s.seed}|${k}`) % 2 === 0 },
  { match: (_k, raw) => mimeOfName(raw) !== "", make: (s, _k, raw) => s.emit(mimeOfName(raw), raw) },
]

const DEFAULT_SCALAR: ScalarRule = { match: () => true, make: (s, k) => sentence(`${s.seed}|${k}`) }

const scalarFor = (key: string, stub: Stub): unknown => {
  const lower = key.toLowerCase()
  const rule = SCALAR_RULES.find((r) => r.match(lower, key)) ?? DEFAULT_SCALAR
  return rule.make(stub, lower, key)
}

const ensurePath = (target: unknown, path: string[], stub: Stub): void => {
  const head = path[0]
  if (head === undefined) return
  if (Array.isArray(target)) {
    for (const item of target) ensurePath(item, path, stub)
    return
  }
  if (!isRecord(target)) return
  if (head === "*") {
    ensurePath(target, path.slice(1), stub)
    return
  }
  if (path.length === 1) {
    if (head in target) return
    target[head] = scalarFor(head, stub)
    return
  }
  const current = target[head]
  if (Array.isArray(current) || isRecord(current)) {
    ensurePath(current, path.slice(1), stub)
    return
  }
  const next = {}
  target[head] = next
  ensurePath(next, path.slice(1), stub)
}

const typeNameOf = (node: IrNode, fallback: string): string => {
  const out = node["out"]
  if (typeof out === "string") return out
  if (isRecord(out) && typeof out["name"] === "string") return out["name"]
  if (typeof node["itemType"] === "string") return `${node["itemType"]}Result`
  return fallback
}

const descriptionOf = (node: IrNode): string | null => {
  const text = node["description"]
  return typeof text === "string" && text !== "" ? text : null
}

type Produced = { value: unknown; source: TypeSource }

type ProduceRequest = {
  seed: string
  typeName: string
  catalog: TypeCatalog
  media: MediaContext
  required: string[][]
  fallbackText: string
  index: number
}

const produce = (request: ProduceRequest): Produced => {
  const stub = stubOf(request.seed, request.media)
  const built = typeValue({
    typeName: request.typeName,
    catalog: request.catalog,
    emit: stub.emit,
    index: request.index,
    fallbackText: request.fallbackText,
  })
  for (const path of request.required) ensurePath(built.value, path, stub)
  return built
}

const delayFor = (key: string): number =>
  MIN_DELAY_MS + Math.floor(mulberry32(fnv1a(key))() * (MAX_DELAY_MS - MIN_DELAY_MS))

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const preview = (value: unknown): string => {
  const json = JSON.stringify(value ?? null)
  if (json === undefined) return "null"
  return json.length <= PREVIEW_CHARS ? json : `${json.slice(0, PREVIEW_CHARS)}…`
}

const collectRefs = (value: unknown, acc: string[]): void => {
  if (isRef(value)) {
    acc.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, acc)
    return
  }
  if (!isRecord(value)) return
  for (const item of Object.values(value)) collectRefs(item, acc)
}

const collectNodeLinks = (value: unknown, acc: string[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectNodeLinks(item, acc)
    return
  }
  if (!isRecord(value)) return
  if (typeof value["node"] === "string") acc.push(value["node"])
  for (const item of Object.values(value)) collectNodeLinks(item, acc)
}

const depsOf = (node: IrNode, ids: Set<string>): string[] => {
  const refs: string[] = []
  const links: string[] = []
  collectRefs(node, refs)
  collectNodeLinks(node, links)
  const heads = refs.map((r) => segmentsOf(r)[0] ?? "").filter((h) => ids.has(h))
  return [...new Set([...heads, ...links.filter((l) => ids.has(l))])]
}

export function dependencyMap(nodes: Record<string, IrNode>): Map<string, string[]> {
  const ids = new Set(Object.keys(nodes))
  const deps = new Map<string, string[]>()
  for (const [id, node] of Object.entries(nodes)) deps.set(id, depsOf(node, ids).filter((d) => d !== id))
  return deps
}

export function topoOrder(nodes: Record<string, IrNode>): { order: string[]; cycles: string[] } {
  const deps = dependencyMap(nodes)
  const order: string[] = []
  const done = new Set<string>()
  const pending = Object.keys(nodes)

  while (pending.length > 0) {
    const ready = pending.filter((id) => (deps.get(id) ?? []).every((d) => done.has(d)))
    if (ready.length === 0) break
    for (const id of ready) {
      order.push(id)
      done.add(id)
      pending.splice(pending.indexOf(id), 1)
    }
  }
  return { order: [...order, ...pending], cycles: pending }
}

const FIELD_NOTES: { field: string; note: (value: unknown) => string }[] = [
  { field: "timeoutMs", note: (v) => `таймаут ${String(v)} мс объявлен в IR, но не применяется` },
  { field: "timeoutSeconds", note: (v) => `таймаут ${String(v)} с объявлен в IR, но не применяется` },
  { field: "ttlSeconds", note: (v) => `кэш ttlSeconds: ${String(v)} не используется` },
  { field: "outputContract", note: () => "контракт выхода (outputContract) не проверяется" },
  { field: "trustIn", note: (v) => `метка доверия trustIn: ${String(v)} не проверяется` },
  { field: "allowedSets", note: () => "allowedSets не валидируются" },
  { field: "overrides", note: (v) => `overrides модели не применяются (${preview(v)})` },
  { field: "onTimeout", note: (v) => `ветка onTimeout: ${String(v)} недостижима` },
  { field: "effect", note: (v) => `эффект «${String(v)}» не выполнялся` },
  { field: "pure", note: () => "чистота функции не проверялась" },
]

const fieldNotes = (node: IrNode): string[] =>
  FIELD_NOTES.filter((r) => node[r.field] !== undefined).map((r) => r.note(node[r.field]))

const branchNotes = (nodes: Record<string, IrNode>, nodeId: string): string[] => {
  const owners = Object.entries(nodes)
    .filter(([, n]) => n["kind"] === "switch")
    .filter(([, n]) => {
      const links: string[] = []
      collectNodeLinks(n["cases"], links)
      return links.includes(nodeId)
    })
    .map(([id]) => id)
  if (owners.length === 0) return []
  return [`узел входит в ветку switch «${owners.join(", ")}» и исполнен безусловно, а не по условию`]
}

const flowNotes = (ir: Ir): string[] => {
  const notes = [
    `независимые узлы исполнены параллельно, предел конкурентности ${NODE_CONCURRENCY}`,
    "вызовы моделей, инструментов и кода заменены детерминированными заглушками",
  ]
  if (ir.defaults !== undefined) notes.push(`defaults не применяются (${preview(ir.defaults)})`)
  if (ir.policies !== undefined) notes.push("политики (trust, pii, visibility, escalation) не применяются")
  if (ir.budget !== undefined) notes.push(`бюджет воркфлоу не списывается (${preview(ir.budget)})`)
  if (ir.context !== undefined) notes.push(`контекст [${ir.context.join(", ")}] не собирается`)
  return notes
}

const retryNote = (ir: Ir): string[] => {
  const defaults = isRecord(ir.defaults) ? ir.defaults : {}
  const retry = defaults["retry"]
  if (!isRecord(retry)) return ["ретраи выключены"]
  return [`ретраи выключены (в IR defaults.retry.attempts: ${String(retry["attempts"])})`]
}

const renderPrompt = (ctx: HandlerContext): string => {
  const slots = isRecord(ctx.node["in"]) ? ctx.node["in"] : {}
  const lines = Object.entries(slots).map(
    ([slot, ref]) => `- ${slot} ← ${typeof ref === "string" ? ref : preview(ref)}\n  ${preview(ctx.inputs[slot])}`,
  )
  return [
    `# узел ${ctx.nodeId}`,
    `роль модели: ${String(ctx.node["modelRole"] ?? "не задана")}`,
    `функция: ${String(ctx.node["fn"] ?? ctx.node["tool"] ?? "—")}`,
    "",
    "## слоты",
    ...lines,
    "",
    "## заглушка",
    "Промт собран плейграундом из слотов IR. Компилятор промтов не подключён, реального вызова модели не было.",
  ].join("\n")
}

const EXTRA_INPUTS = ["over", "on"]

const nodeInputs = (node: IrNode, scope: Scope): Record<string, unknown> => ({
  ...resolveSlots(node["in"], scope),
  ...Object.fromEntries(
    EXTRA_INPUTS.filter((f) => node[f] !== undefined).map((f) => [f, resolveValue(node[f], scope)]),
  ),
})

const outputOf = (ctx: HandlerContext, index = 0): Produced & { outputType: string } => {
  const typeName = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  const built = produce({
    seed: `${ctx.nodeId}|${typeName}|${stableJson(ctx.inputs)}`,
    typeName,
    catalog: ctx.catalog,
    media: ctx.media,
    required: ctx.required,
    fallbackText: descriptionOf(ctx.node) ?? ctx.nodeId,
    index,
  })
  return { ...built, outputType: typeName }
}

const sourceNote = (built: Produced & { outputType: string }): string =>
  SOURCE_NOTES[built.source](built.outputType)

const settle = async (ctx: HandlerContext): Promise<void> => {
  await sleep(delayFor(`${ctx.nodeId}|${stableJson(ctx.inputs)}`))
}

const llmHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: renderPrompt(ctx),
    facts: [],
    simplifications: [
      `модель не вызвана: ${sourceNote(built)}`,
      "промт собран заглушкой, компилятор промтов не подключён",
      ...fieldNotes(ctx.node),
    ],
  }
}

const toolHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: null,
    facts: [],
    simplifications: [
      `инструмент «${String(ctx.node["tool"])}» не вызван: ${sourceNote(built)}`,
      ...fieldNotes(ctx.node),
    ],
  }
}

const codeHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: null,
    facts: [],
    simplifications: [
      `функция «${String(ctx.node["fn"])}» не исполнена: ${sourceNote(built)}`,
      ...fieldNotes(ctx.node),
    ],
  }
}

const humanHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: null,
    facts: [`форма ${String(ctx.node["form"] ?? "—")}`],
    simplifications: [
      `ожидание человека пропущено: форма «${String(ctx.node["form"])}» заполнена заглушкой сразу`,
      sourceNote(built),
      ...fieldNotes(ctx.node),
    ],
  }
}

const callHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: renderPrompt(ctx),
    facts: [],
    simplifications: [
      `компонент «${String(ctx.node["component"])}» не раскрыт: вложенные узлы не исполнялись`,
      sourceNote(built),
      ...fieldNotes(ctx.node),
    ],
  }
}

const mapHandler: Handler = async (ctx) => {
  const source = resolveValue(ctx.node["over"], ctx.scope)
  const items = Array.isArray(source) ? source : []
  const taken = items.slice(0, MAP_ITEMS)
  const inner = isRecord(ctx.node["do"]) ? ctx.node["do"] : {}
  const itemType = typeNameOf(inner, `${String(ctx.node["itemType"] ?? ctx.nodeId)}Result`)
  const limit = numberOf(ctx.node["concurrency"]) ?? 1

  const built = await pooled(taken.length, limit, async (index) => {
    const item = taken[index]
    const scope: Scope = { input: ctx.scope.input, values: { ...ctx.scope.values, item } }
    const inputs = resolveSlots(inner["in"], scope)
    await sleep(delayFor(`${ctx.nodeId}#${index}`))
    const value = produce({
      seed: `${ctx.nodeId}#${index}|${itemType}|${stableJson(inputs)}`,
      typeName: itemType,
      catalog: ctx.catalog,
      media: ctx.media,
      required: [],
      fallbackText: descriptionOf(inner) ?? `${ctx.nodeId} #${index + 1}`,
      index,
    })
    ctx.progress({ index, total: taken.length, source: items.length, output: value.value })
    return value
  })

  const first = built[0]
  const notes = [
    `элементы исполнены параллельно, предел конкурентности ${limit}`,
    `обработано ${taken.length} из ${items.length} ${plural(items.length, "элемент")}, лимит плейграунда ${MAP_ITEMS}`,
    `вложенный узел вида «${String(inner["kind"] ?? "—")}» заменён заглушкой типа ${itemType}`,
    first === undefined ? "список пуст: элементов не было" : SOURCE_NOTES[first.source](itemType),
  ]
  if (ctx.node["onItemError"] !== undefined)
    notes.push(`политика onItemError: ${String(ctx.node["onItemError"])} не проверялась — ошибок не было`)
  if (ctx.node["maxItems"] !== undefined) notes.push(`maxItems ${String(ctx.node["maxItems"])} не достигнут`)

  return {
    output: built.map((item) => item.value),
    outputType: `${itemType}[]`,
    source: first?.source ?? "stub",
    prompt: null,
    facts: [`${taken.length} из ${items.length} ${plural(items.length, "элемент")}`],
    simplifications: [...notes, ...fieldNotes(ctx.node)],
  }
}

const switchHandler: Handler = async (ctx) => {
  await settle(ctx)
  const cases = isRecord(ctx.node["cases"]) ? ctx.node["cases"] : {}
  const names = Object.keys(cases)
  const chosen = names[0]
  if (chosen === undefined) {
    return {
      output: null,
      outputType: "unknown",
      source: "none",
      prompt: null,
      facts: ["ветвей нет"],
      simplifications: ["у switch нет ветвей, выход равен null", ...fieldNotes(ctx.node)],
    }
  }
  return {
    output: resolveValue(cases[chosen], ctx.scope),
    outputType: "unknown",
    source: "none",
    prompt: null,
    facts: [`ветка «${chosen}» из ${names.length}`],
    simplifications: [
      `выбрана первая ветка «${chosen}» из [${names.join(", ")}]`,
      `условие ${String(ctx.node["on"])} не вычислялось`,
      "тип выхода switch в IR не указан",
      "узлы ветвей исполнены безусловно как обычные узлы графа",
      ...fieldNotes(ctx.node),
    ],
  }
}

const branchNodeIdOf = (branch: unknown): string | null => {
  if (!isRecord(branch)) return null
  const id = branch["node"]
  return typeof id === "string" ? id : null
}

const branchParams = (source: IrNode | undefined): Record<string, unknown> => {
  const overrides = source?.["overrides"]
  return isRecord(overrides) ? overrides : {}
}

const branchModel = (source: IrNode | undefined): string | null => {
  const role = source?.["modelRole"]
  return typeof role === "string" ? role : null
}

const takenKeys = (keys: string[], join: string, k: number | null): string[] => {
  if (join !== "quorum") return keys
  return keys.slice(0, Math.min(k ?? keys.length, keys.length))
}

const parallelHandler: Handler = async (ctx) => {
  const branches = isRecord(ctx.node["branches"]) ? ctx.node["branches"] : {}
  const keys = Object.keys(branches)
  const join = String(ctx.node["join"] ?? "all")
  const quorum = takenKeys(keys, join, numberOf(ctx.node["k"]))
  const fallback = resolveValue(ctx.node["branchDefault"], ctx.scope)
  const output: Record<string, unknown> = {}
  const missing: string[] = []

  for (const [branchIndex, branchKey] of keys.entries()) {
    const branch = branches[branchKey]
    const nodeId = branchNodeIdOf(branch)
    const source = nodeId === null ? undefined : (ctx.ir.nodes[nodeId] as IrNode | undefined)
    const timing = nodeId === null ? undefined : ctx.timings[nodeId]
    const head = {
      parentNodeId: ctx.nodeId,
      branchKey,
      branchIndex,
      total: keys.length,
      nodeId,
      model: branchModel(source),
      params: branchParams(source),
    }
    ctx.emit("branch_start", { ...head, startedAt: timing?.startedAt ?? null, description: descriptionOf(source ?? {}) })

    const resolved = resolveValue(branch, ctx.scope)
    const value = resolved === undefined ? fallback : resolved
    if (resolved === undefined) missing.push(branchKey)
    if (quorum.includes(branchKey)) output[branchKey] = value

    ctx.saveRender({ branchKey, input: ctx.inputs, output: value, prompt: null })
    ctx.emit("branch_finish", {
      ...head,
      status: resolved === undefined ? "default" : "ok",
      ms: timing?.ms ?? 0,
      endedAt: timing?.endedAt ?? null,
      counted: quorum.includes(branchKey),
      output: value,
    })
  }

  const notes = [
    `ветки — самостоятельные узлы графа, исполнены планировщиком; узел «${ctx.nodeId}» только свёл их выходы`,
    `join: ${join}${join === "quorum" ? `, k = ${String(ctx.node["k"])}, в выход попали ${quorum.length} из ${keys.length}` : ""}`,
    `concurrency ${String(ctx.node["concurrency"] ?? "не задана")} из IR не ограничивала веток: планировщик держит общий предел ${NODE_CONCURRENCY}`,
  ]
  if (missing.length > 0)
    notes.push(`ветки без выхода заменены branchDefault: ${missing.join(", ")} (политика ${String(ctx.node["onBranchError"] ?? "—")})`)

  return {
    output,
    outputType: typeNameOf(ctx.node, `${ctx.nodeId}_out`),
    source: "none",
    prompt: null,
    facts: [`${quorum.length} из ${keys.length} ${plural(keys.length, "ветка")}`, `join ${join}`],
    simplifications: [...notes, ...fieldNotes(ctx.node)],
  }
}

const iterationScore = (index: number, total: number): number =>
  round2(Math.min(LOOP_THRESHOLD + 0.05, 0.55 + (index * 0.3) / Math.max(total - 1, 1)))

const SCORE_KEYS = new Set(["score", "rating", "confidence"])
const REACHED_KEYS = new Set(["accepted", "clean", "done", "ok", "meetsThreshold", "allDone", "valid"])

const withIterationScore = (value: unknown, score: number, reached: boolean): unknown => {
  if (!isRecord(value)) return value
  const entries = Object.entries(value).map(([key, item]) => {
    if (SCORE_KEYS.has(key) && typeof item === "number") return [key, score]
    if (REACHED_KEYS.has(key) && typeof item === "boolean") return [key, reached]
    return [key, item]
  })
  return Object.fromEntries(entries)
}

const loopHandler: Handler = async (ctx) => {
  const body = isRecord(ctx.node["body"]) ? ctx.node["body"] : {}
  const bodyType = typeNameOf(body, `${ctx.nodeId}_iteration`)
  const maxIter = numberOf(ctx.node["maxIter"]) ?? LOOP_ITERATIONS
  const planned = Math.max(1, Math.min(Math.round(maxIter), LOOP_ITERATIONS))
  const select = String(ctx.node["select"] ?? "last")
  const carry = resolveValue(ctx.node["carry"], ctx.scope)

  const passes: { iter: number; score: number; value: unknown; source: TypeSource }[] = []

  for (let iter = 0; iter < planned; iter++) {
    const score = iterationScore(iter, planned)
    ctx.emit("iteration_start", { parentNodeId: ctx.nodeId, iter, total: planned, carry })
    await sleep(delayFor(`${ctx.nodeId}@${iter}`))
    const built = produce({
      seed: `${ctx.nodeId}@${iter}|${bodyType}|${stableJson(ctx.inputs)}`,
      typeName: bodyType,
      catalog: ctx.catalog,
      media: ctx.media,
      required: [],
      fallbackText: descriptionOf(body) ?? `${ctx.nodeId}: итерация ${iter + 1}`,
      index: iter,
    })
    const reached = score >= LOOP_THRESHOLD
    const stopReason = reached ? "порог взят" : iter === planned - 1 ? "исчерпан maxIter" : null
    const value = withIterationScore(built.value, score, reached)
    passes.push({ iter, score, value, source: built.source })
    ctx.saveRender({ iteration: iter, input: ctx.inputs, output: value, prompt: null })
    ctx.emit("iteration_finish", {
      parentNodeId: ctx.nodeId,
      iter,
      total: planned,
      score,
      stopReason,
      selected: false,
      output: value,
    })
    if (reached) break
  }

  const empty = { iter: 0, score: 0, value: null, source: "none" as TypeSource }
  const last = passes[passes.length - 1] ?? empty
  const best = select === "best" ? passes.reduce((a, b) => (b.score > a.score ? b : a), last) : last
  ctx.emit("iteration_selected", { parentNodeId: ctx.nodeId, iter: best.iter, score: best.score, selected: true })

  const stopReason = best.score >= LOOP_THRESHOLD ? "порог взят" : "исчерпан maxIter"
  return {
    output: best.value,
    outputType: bodyType,
    source: best.source,
    prompt: null,
    facts: [`${passes.length} ${plural(passes.length, "итерация")}`, stopReason],
    simplifications: [
      `тело цикла не исполнялось: каждая итерация — заглушка типа ${bodyType}`,
      `оценка итерации синтетическая и растёт линейно, порог остановки ${LOOP_THRESHOLD}`,
      "оценка итерации подставлена в поля score/accepted выхода, чтобы итерации отличались",
      `условие stopWhen ${String(ctx.node["stopWhen"] ?? "—")} не вычислялось`,
      `maxIter ${String(maxIter)} урезан лимитом плейграунда ${LOOP_ITERATIONS}`,
      `select: ${select}`,
      SOURCE_NOTES[best.source](bodyType),
      ...fieldNotes(ctx.node),
    ],
  }
}

const gateHandler: Handler = async (ctx) => {
  const waitFor = String(ctx.node["waitFor"] ?? "human")
  const assignee = String(ctx.node["assignee"] ?? "—")
  const role = String(ctx.node["role"] ?? "—")
  ctx.emit("gate_wait", {
    parentNodeId: ctx.nodeId,
    waitFor,
    assignee,
    role,
    timeoutMs: ctx.node["timeoutMs"] ?? null,
    onTimeout: ctx.node["onTimeout"] ?? null,
  })
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: null,
    facts: [`решение роли ${role}`, `исполнитель ${assignee}`],
    simplifications: [
      `ожидание «${waitFor}» не выполнялось: решение подставлено заглушкой сразу`,
      `таймаут ${String(ctx.node["timeoutMs"] ?? "—")} мс и ветка onTimeout ${String(ctx.node["onTimeout"] ?? "—")} недостижимы`,
      sourceNote(built),
      ...fieldNotes(ctx.node),
    ],
  }
}

const fallbackHandler: Handler = async (ctx) => {
  await settle(ctx)
  const built = outputOf(ctx)
  return {
    output: built.value,
    outputType: built.outputType,
    source: built.source,
    prompt: null,
    facts: [],
    simplifications: [
      `вид узла «${String(ctx.node["kind"])}» не поддержан исполнителем, выход сгенерирован по типу`,
      sourceNote(built),
      ...fieldNotes(ctx.node),
    ],
  }
}

const HANDLERS: Record<string, Handler> = {
  llm: llmHandler,
  tool: toolHandler,
  code: codeHandler,
  human: humanHandler,
  call: callHandler,
  map: mapHandler,
  switch: switchHandler,
  parallel: parallelHandler,
  loop: loopHandler,
  gate: gateHandler,
}

const requiredPathsOf = (ir: Ir, nodeId: string): string[][] => {
  const refs: string[] = []
  collectRefs(ir.nodes, refs)
  collectRefs(ir.output, refs)
  return refs
    .map(segmentsOf)
    .filter((path) => path[0] === nodeId && path[1] === "out")
    .map((path) => path.slice(2))
    .filter((path) => path.length > 0)
}

const inputRootOf = (ir: Ir): string => {
  const ids = new Set(Object.keys(ir.nodes))
  const refs: string[] = []
  collectRefs(ir.nodes, refs)
  const heads = refs
    .map((r) => segmentsOf(r)[0] ?? "")
    .filter((h) => h.length > 0 && !ids.has(h) && h !== "item" && h !== "in")
  return heads[0] ?? "input"
}

export function describeFlowInput(ir: Ir): InputSchema {
  const root = inputRootOf(ir)
  const used = new Map<string, { node: string; slot: string }[]>()

  for (const [nodeId, node] of Object.entries(ir.nodes)) {
    const slots = isRecord((node as IrNode)["in"]) ? ((node as IrNode)["in"] as Record<string, unknown>) : {}
    for (const [slot, value] of Object.entries(slots)) {
      const refs: string[] = []
      collectRefs(value, refs)
      const paths = refs.map(segmentsOf).filter((p) => p[0] === root)
      for (const path of paths) {
        const field = path.slice(1).join(".") || "(весь вход)"
        used.set(field, [...(used.get(field) ?? []), { node: nodeId, slot }])
      }
    }
  }

  const catalog = ir.types as TypeCatalog
  const declared = produce({
    seed: `${ir.flow}|${ir.input}`,
    typeName: ir.input,
    catalog,
    media: { types: catalog, store: null },
    required: [],
    fallbackText: `вход воркфлоу ${ir.flow}`,
    index: 0,
  })

  const stub = stubOf(`${ir.flow}|${ir.input}`, { types: catalog, store: null })
  const example: Record<string, unknown> = isRecord(declared.value) ? { ...declared.value } : {}
  for (const field of used.keys()) {
    if (field === "(весь вход)") continue
    ensurePath(example, field.split("."), stub)
  }

  return {
    flow: ir.flow,
    type: ir.input,
    root: `$${root}`,
    freeform: true,
    fields: [...used.entries()].map(([path, usedBy]) => ({ path, usedBy })),
    context: ir.context ?? [],
    example,
    note:
      declared.source === "none"
        ? "тип входа в IR не объявлен: поля выведены из ссылок IR, форма свободная — вход можно передать любым JSON"
        : `пример собран по типу «${ir.input}» из IR (${declared.source}); поля из ссылок IR дописаны сверху`,
  }
}

const rawOf = (kind: string, model: string | null, output: unknown): string => {
  const head =
    model === null
      ? `# ${kind}: ответ собран плейграундом, обращения наружу не было`
      : `# роль ${model}: ответ собран плейграундом, вызова модели не было`
  const body = JSON.stringify(output ?? null, null, 2) ?? "null"
  const clipped = body.length <= RAW_CHARS ? body : `${body.slice(0, RAW_CHARS)}\n… обрезано (${body.length} знаков)`
  return [head, "```json", clipped, "```"].join("\n")
}

const rawFailure = (kind: string, message: string): string =>
  [`# ${kind}: разбор ответа не удался`, "```text", message, "```"].join("\n")

export class Executor {
  private readonly seqs = new Map<string, number>()

  constructor(
    private readonly db: RunsRepository,
    private readonly publish: Publish,
  ) {}

  start(ir: Ir, irHash: string | undefined, input: unknown): Run {
    const run: Run = {
      id: randomUUID(),
      flow: ir.flow,
      input,
      status: "running",
      irHash,
      startedAt: Date.now(),
    }
    this.db.createRun(run)
    void this.execute(run, ir).catch((error: unknown) => this.abort(run, error))
    return run
  }

  private abort(run: Run, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.db.finishRun(run.id, "error", Date.now())
    this.record(run.id, "run_fail", undefined, { message }, Date.now())
  }

  private mediaFor(runId: string, nodeId: string, ir: Ir): MediaContext {
    return {
      types: ir.types as TypeCatalog,
      store: (blob) =>
        this.db.saveBlob({
          id: blob.id,
          runId,
          nodeId,
          mime: blob.mime,
          name: blob.name,
          bytes: blob.body.length,
          body: blob.body,
        }),
    }
  }

  private record(runId: string, type: string, nodeId: string | undefined, payload: unknown, at: number): void {
    const seq = (this.seqs.get(runId) ?? 0) + 1
    this.seqs.set(runId, seq)
    const event: RunEvent = { seq, at, type, nodeId, payload }
    this.db.appendEvent(runId, event)
    this.publish({ t: "run", runId, event })
  }

  private async execute(run: Run, ir: Ir): Promise<void> {
    const nodes = ir.nodes as Record<string, IrNode>
    const clock = new RunClock(run.startedAt)
    const { order, cycles } = topoOrder(nodes)
    const scope: Scope = { input: run.input, values: {} }
    const emit = (type: string, nodeId: string | undefined, payload: unknown): void =>
      this.record(run.id, type, nodeId, payload, clock.now())

    const cycleNote = cycles.length === 0 ? [] : [`цикл в графе: [${cycles.join(", ")}] исполнены в порядке объявления`]

    emit("run_start", undefined, {
      flow: ir.flow,
      irHash: run.irHash,
      order,
      input: run.input,
      concurrency: NODE_CONCURRENCY,
      simplifications: [...flowNotes(ir), ...retryNote(ir), ...cycleNote],
    })

    const status = await this.runNodes(run, ir, nodes, order, scope, emit, clock)
    const endedAt = clock.now()
    this.db.finishRun(run.id, status, endedAt)

    emit("run_finish", undefined, {
      status,
      ms: endedAt - run.startedAt,
      output: resolveValue(ir.output.from, scope),
      outputType: ir.output.type,
      simplifications: [...flowNotes(ir), ...retryNote(ir), ...cycleNote],
    })
    this.seqs.delete(run.id)
  }

  private async runNodes(
    run: Run,
    ir: Ir,
    nodes: Record<string, IrNode>,
    order: string[],
    scope: Scope,
    emit: (type: string, nodeId: string | undefined, payload: unknown) => void,
    clock: RunClock,
  ): Promise<RunStatus> {
    const timings: Record<string, NodeTiming> = {}
    const catalog = ir.types as TypeCatalog
    const nodeCount = order.length
    let status: RunStatus = "ok"

    await runByReadiness({
      ids: order,
      deps: dependencyMap(nodes),
      concurrency: NODE_CONCURRENCY,
      now: () => clock.now(),
      run: async (slot) => {
        const node = nodes[slot.id]
        if (node === undefined) return true

        const nodeId = slot.id
        const kind = String(node["kind"] ?? "unknown")
        const inputs = nodeInputs(node, scope)
        const mark = clock.mark()
        const startedAt = clock.now()
        const queuedMs = Math.max(startedAt - slot.readyAt, 0)

        emit("node_start", nodeId, {
          kind,
          description: node["description"] ?? null,
          slots: node["in"] ?? null,
          inputs,
          startedAt,
          queuedAt: queuedMs > 0 ? slot.readyAt : null,
          queuedMs,
        })

        const ctx: HandlerContext = {
          nodeId,
          node,
          ir,
          catalog,
          scope,
          inputs,
          required: requiredPathsOf(ir, nodeId),
          media: this.mediaFor(run.id, nodeId, ir),
          timings,
          emit: (type, payload) => emit(type, nodeId, payload),
          progress: (payload) => emit("node_progress", nodeId, payload),
          saveRender: (part) =>
            this.db.saveRender({
              runId: run.id,
              nodeId,
              branchKey: part.branchKey ?? "",
              iteration: part.iteration ?? 0,
              input: part.input,
              output: part.output,
              prompt: part.prompt,
            }),
        }

        const result = await this.runNode(ctx)
        const ms = clock.since(mark)
        const endedAt = clock.now()
        timings[nodeId] = { startedAt, endedAt, ms }

        if (result.failure !== null) {
          emit("node_fail", nodeId, {
            kind,
            ms,
            startedAt,
            endedAt,
            message: result.failure,
            raw: rawFailure(kind, result.failure),
            parseError: result.failure,
          })
          status = "error"
          return false
        }

        scope.values[nodeId] = { out: result.output }
        ctx.saveRender({ input: inputs, output: result.output, prompt: result.prompt })

        emit("node_finish", nodeId, this.finishPayload(ir, nodes, ctx, result, { kind, ms, startedAt, endedAt, queuedMs, nodeCount }))
        return true
      },
    })

    return status
  }

  private finishPayload(
    ir: Ir,
    nodes: Record<string, IrNode>,
    ctx: HandlerContext,
    result: HandlerResult,
    timing: { kind: string; ms: number; startedAt: number; endedAt: number; queuedMs: number; nodeCount: number },
  ): Record<string, unknown> {
    const request: MetricsRequest = {
      kind: timing.kind,
      node: ctx.node,
      flowBudget: ir.budget,
      nodeCount: timing.nodeCount,
      prompt: result.prompt,
      inputs: ctx.inputs,
      output: result.output,
      attempt: 1,
    }
    const metrics: NodeMetrics = estimateMetrics(request)
    const checks: Check[] = checksOf({
      typeName: result.outputType,
      catalog: ctx.catalog,
      source: result.source,
      output: result.output,
      requiredPaths: ctx.required,
      usdMicros: metrics.usdMicros,
      budgetMicros: nodeBudgetMicros(request),
    })
    const summary = summaryOf({
      nodeId: ctx.nodeId,
      kind: timing.kind,
      description: descriptionOf(ctx.node),
      output: result.output,
      outputType: result.outputType,
      undeclared: result.source === "stub",
      facts: result.facts,
    })

    return {
      kind: timing.kind,
      status: "ok",
      ms: timing.ms,
      startedAt: timing.startedAt,
      endedAt: timing.endedAt,
      queuedMs: timing.queuedMs,
      summary,
      outputType: result.outputType,
      outputSource: result.source,
      output: result.output,
      tokens: metrics.tokens,
      costUsd: metrics.costUsd,
      usdMicros: metrics.usdMicros,
      model: metrics.model,
      provider: metrics.provider,
      attempt: metrics.attempt,
      checks,
      raw: rawOf(timing.kind, metrics.model, result.output),
      simplifications: [
        ...result.simplifications,
        ...metricsNotes(metrics, request),
        ...branchNotes(nodes, ctx.nodeId),
        ...retryNote(ir),
      ],
    }
  }

  private async runNode(ctx: HandlerContext): Promise<HandlerResult & { failure: string | null }> {
    const handler = HANDLERS[String(ctx.node["kind"] ?? "")] ?? fallbackHandler
    try {
      const result = await handler(ctx)
      return { ...result, failure: null }
    } catch (error: unknown) {
      return {
        output: null,
        outputType: "unknown",
        source: "none",
        prompt: null,
        facts: [],
        simplifications: [],
        failure: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
