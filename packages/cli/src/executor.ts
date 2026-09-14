import { randomUUID } from "node:crypto"
import { makeMedia, mimeOfName, mimeOfType } from "./media.js"
import type { Ir } from "@wf/synth"
import type { MediaContext, MediaEnvelope } from "./media.js"
import type { Run, RunEvent, RunStatus, ServerEvent } from "./events.js"
import type { RunsRepository } from "./runs-db.js"

export const MAP_ITEMS = 3
export const MIN_DELAY_MS = 150
export const MAX_DELAY_MS = 400
export const PREVIEW_CHARS = 400

export type IrNode = Record<string, unknown>
export type Publish = (event: ServerEvent) => void

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

type HandlerContext = {
  nodeId: string
  node: IrNode
  ir: Ir
  scope: Scope
  inputs: Record<string, unknown>
  required: string[][]
  media: MediaContext
  progress: (payload: Record<string, unknown>) => void
}

type HandlerResult = {
  output: unknown
  outputType: string
  prompt: string | null
  simplifications: string[]
}

type Handler = (ctx: HandlerContext) => Promise<HandlerResult>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const isRef = (v: unknown): v is string => typeof v === "string" && v.startsWith("$")

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

const fnv1a = (input: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOUNS = ["вариант", "черновик", "подборка", "сводка", "предложение", "разбор", "заметка", "набор"]
const ADJECTIVES = ["короткий", "точный", "спорный", "проверенный", "черновой", "сильный", "нейтральный"]
const TAILS = ["по заявке", "по трём отелям", "по фильтрам", "для менеджера", "для клиента", "без правок"]

const pick = <T>(list: readonly T[], rnd: () => number, fallback: T): T => list[Math.floor(rnd() * list.length)] ?? fallback

const sentence = (rnd: () => number): string =>
  `${pick(ADJECTIVES, rnd, "черновой")} ${pick(NOUNS, rnd, "вариант")} ${pick(TAILS, rnd, "по заявке")}`

const hex6 = (rnd: () => number): string => Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0")

const round2 = (n: number): number => Math.round(n * 100) / 100

const snake = (name: string): string =>
  name.replace(/\[\]$/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()

export type Stub = {
  rnd: () => number
  emit: (mime: string, label: string) => MediaEnvelope
  media: MediaContext
}

const hex8 = (value: number): string => value.toString(16).padStart(8, "0")

const stubOf = (seed: string, media: MediaContext): Stub => {
  const rnd = mulberry32(fnv1a(seed))
  let issued = 0
  return {
    rnd,
    media,
    emit: (mime, label) => {
      issued += 1
      return makeMedia(media, hex8(fnv1a(`${seed}|${label}|${issued}`)), mime, label, rnd)
    },
  }
}

type Rule<T> = {
  match: (key: string, raw: string) => boolean
  make: (stub: Stub, key: string, raw: string) => T
}

const OBJECT_KEYS = new Set([
  "best",
  "winner",
  "selected",
  "result",
  "item",
  "payload",
  "request",
  "filters",
  "options",
  "params",
  "form",
])

const SCALAR_RULES: Rule<unknown>[] = [
  { match: (k) => k.endsWith("id"), make: (s, k) => `${snake(k)}_${hex6(s.rnd)}` },
  { match: (k) => k.includes("score") || k.includes("rating") || k.includes("confidence"), make: (s) => round2(s.rnd()) },
  { match: (k) => k.includes("count") || k.includes("index") || k.includes("total"), make: (s) => Math.floor(s.rnd() * 10) },
  { match: (k) => k.includes("decision") || k.includes("verdict"), make: () => "accept" },
  { match: (k) => k.startsWith("is") || k.startsWith("has"), make: (s) => s.rnd() > 0.5 },
  { match: (_k, raw) => mimeOfName(raw) !== "", make: (s, _k, raw) => s.emit(mimeOfName(raw), raw) },
  { match: (k) => OBJECT_KEYS.has(k), make: (s, k) => objectOfType(k, s) },
]

const DEFAULT_SCALAR: Rule<unknown> = { match: () => true, make: (s) => sentence(s.rnd) }

const scalarFor = (key: string, stub: Stub): unknown => {
  const lower = key.toLowerCase()
  const rule = SCALAR_RULES.find((r) => r.match(lower, key)) ?? DEFAULT_SCALAR
  return rule.make(stub, lower, key)
}

const TYPE_RULES: Rule<unknown>[] = [
  { match: (t) => t.endsWith("text") || t.endsWith("string") || t.endsWith("message"), make: (s) => sentence(s.rnd) },
  { match: (t) => t.endsWith("decision") || t.endsWith("status"), make: () => "accept" },
  { match: (t) => t.endsWith("number") || t.endsWith("count") || t.endsWith("score"), make: (s) => round2(s.rnd() * 10) },
  { match: (t) => t.endsWith("bool") || t.endsWith("boolean") || t.endsWith("flag"), make: (s) => s.rnd() > 0.5 },
]

function objectOfType(typeName: string, stub: Stub): Record<string, unknown> {
  return {
    _type: typeName,
    _stub: true,
    id: `${snake(typeName)}_${hex6(stub.rnd)}`,
    title: sentence(stub.rnd),
    score: round2(stub.rnd()),
  }
}

const valueOfType = (typeName: string, stub: Stub): unknown => {
  if (typeName.endsWith("[]")) {
    const base = typeName.slice(0, -2)
    return Array.from({ length: MAP_ITEMS }, () => valueOfType(base, stub))
  }
  const mime = mimeOfType(stub.media.types, typeName)
  if (mime !== "") return stub.emit(mime, typeName)
  const rule = TYPE_RULES.find((r) => r.match(typeName.toLowerCase(), typeName))
  if (rule) return rule.make(stub, typeName, typeName)
  return objectOfType(typeName, stub)
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
  const next = isRecord(target[head]) ? target[head] : {}
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

const generate = (
  key: string,
  typeName: string,
  inputs: unknown,
  required: string[][],
  media: MediaContext,
): unknown => {
  const stub = stubOf(`${key}|${typeName}|${stableJson(inputs)}`, media)
  const value = valueOfType(typeName, stub)
  for (const path of required) ensurePath(value, path, stub)
  return value
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

export function topoOrder(nodes: Record<string, IrNode>): { order: string[]; cycles: string[] } {
  const ids = new Set(Object.keys(nodes))
  const deps = new Map<string, Set<string>>()
  for (const [id, node] of Object.entries(nodes)) deps.set(id, new Set(depsOf(node, ids).filter((d) => d !== id)))

  const order: string[] = []
  const done = new Set<string>()
  const pending = [...ids]

  while (pending.length > 0) {
    const ready = pending.filter((id) => [...(deps.get(id) ?? [])].every((d) => done.has(d)))
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
  { field: "budget", note: (v) => `бюджет узла не учитывается (${preview(v)})` },
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
  return [`узел — ветка switch «${owners.join(", ")}», исполнен безусловно, а не по условию`]
}

const flowNotes = (ir: Ir): string[] => {
  const notes = [
    "узлы исполнены последовательно, параллелизма нет",
    "вызовы моделей, инструментов и кода заменены детерминированными заглушками",
  ]
  if (ir.defaults !== undefined) notes.push(`defaults не применяются (${preview(ir.defaults)})`)
  if (ir.policies !== undefined) notes.push("политики (trust, pii, visibility, escalation) не применяются")
  if (ir.budget !== undefined) notes.push(`бюджет воркфлоу не учитывается (${preview(ir.budget)})`)
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

const stubOutput = (ctx: HandlerContext, type: string): unknown =>
  generate(ctx.nodeId, type, ctx.inputs, ctx.required, ctx.media)

const settle = async (ctx: HandlerContext): Promise<void> => {
  await sleep(delayFor(`${ctx.nodeId}|${stableJson(ctx.inputs)}`))
}

const llmHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: renderPrompt(ctx),
    simplifications: [
      `модель не вызвана: ответ сгенерирован по типу выхода ${type}`,
      "промт собран заглушкой, компилятор промтов не подключён",
      ...fieldNotes(ctx.node),
    ],
  }
}

const toolHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: null,
    simplifications: [
      `инструмент «${String(ctx.node["tool"])}» не вызван: результат сгенерирован по типу выхода ${type}`,
      ...fieldNotes(ctx.node),
    ],
  }
}

const codeHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: null,
    simplifications: [
      `функция «${String(ctx.node["fn"])}» не исполнена: результат сгенерирован по типу выхода ${type}`,
      ...fieldNotes(ctx.node),
    ],
  }
}

const humanHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: null,
    simplifications: [
      `ожидание человека пропущено: форма «${String(ctx.node["form"])}» заполнена заглушкой сразу`,
      ...fieldNotes(ctx.node),
    ],
  }
}

const callHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: renderPrompt(ctx),
    simplifications: [
      `компонент «${String(ctx.node["component"])}» не раскрыт: вложенные узлы не исполнялись`,
      `результат сгенерирован по типу выхода ${type}`,
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
  const output: unknown[] = []

  for (const [index, item] of taken.entries()) {
    const scope: Scope = { input: ctx.scope.input, values: { ...ctx.scope.values, item } }
    const inputs = resolveSlots(inner["in"], scope)
    await sleep(delayFor(`${ctx.nodeId}#${index}`))
    const value = generate(`${ctx.nodeId}#${index}`, itemType, inputs, [], ctx.media)
    output.push(value)
    ctx.progress({ index, total: taken.length, source: items.length, output: value })
  }

  const concurrency = ctx.node["concurrency"]
  const notes = [
    concurrency === undefined
      ? "элементы исполнены последовательно"
      : `элементы исполнены последовательно, в IR concurrency: ${String(concurrency)}`,
    `обработано ${taken.length} элемент(ов) из ${items.length}, лимит плейграунда ${MAP_ITEMS}`,
    `вложенный узел вида «${String(inner["kind"] ?? "—")}» заменён заглушкой типа ${itemType}`,
  ]
  if (ctx.node["onItemError"] !== undefined)
    notes.push(`политика onItemError: ${String(ctx.node["onItemError"])} не проверялась — ошибок не было`)
  if (ctx.node["maxItems"] !== undefined) notes.push(`maxItems ${String(ctx.node["maxItems"])} не достигнут`)

  return { output, outputType: `${itemType}[]`, prompt: null, simplifications: [...notes, ...fieldNotes(ctx.node)] }
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
      prompt: null,
      simplifications: ["у switch нет ветвей, выход равен null", ...fieldNotes(ctx.node)],
    }
  }
  return {
    output: resolveValue(cases[chosen], ctx.scope),
    outputType: "unknown",
    prompt: null,
    simplifications: [
      `выбрана первая ветка «${chosen}» из [${names.join(", ")}]`,
      `условие ${String(ctx.node["on"])} не вычислялось`,
      "тип выхода switch в IR не указан",
      "узлы ветвей исполнены безусловно как обычные узлы графа",
      ...fieldNotes(ctx.node),
    ],
  }
}

const fallbackHandler: Handler = async (ctx) => {
  await settle(ctx)
  const type = typeNameOf(ctx.node, `${ctx.nodeId}_out`)
  return {
    output: stubOutput(ctx, type),
    outputType: type,
    prompt: null,
    simplifications: [
      `вид узла «${String(ctx.node["kind"])}» не поддержан исполнителем, выход сгенерирован по типу`,
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

  const stub = stubOf(`${ir.flow}|${ir.input}`, { types: ir.types, store: null })
  const example: Record<string, unknown> = {}
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
    note: "реестра типов ещё нет: поля выведены из ссылок IR, форма свободная — вход можно передать любым JSON",
  }
}

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
    this.record(run.id, "run_fail", undefined, { message })
  }

  private mediaFor(runId: string, nodeId: string, ir: Ir): MediaContext {
    return {
      types: ir.types,
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

  private record(runId: string, type: string, nodeId: string | undefined, payload: unknown): void {
    const seq = (this.seqs.get(runId) ?? 0) + 1
    this.seqs.set(runId, seq)
    const event: RunEvent = { seq, at: Date.now(), type, nodeId, payload }
    this.db.appendEvent(runId, event)
    this.publish({ t: "run", runId, event })
  }

  private async execute(run: Run, ir: Ir): Promise<void> {
    const nodes = ir.nodes as Record<string, IrNode>
    const { order, cycles } = topoOrder(nodes)
    const scope: Scope = { input: run.input, values: {} }
    const emit = (type: string, nodeId: string | undefined, payload: unknown): void =>
      this.record(run.id, type, nodeId, payload)

    const cycleNote = cycles.length === 0 ? [] : [`цикл в графе: [${cycles.join(", ")}] исполнены в порядке объявления`]

    emit("run_start", undefined, {
      flow: ir.flow,
      irHash: run.irHash,
      order,
      input: run.input,
      simplifications: [...flowNotes(ir), ...retryNote(ir), ...cycleNote],
    })

    const status = await this.runNodes(run, ir, nodes, order, scope, emit)
    const endedAt = Date.now()
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
  ): Promise<RunStatus> {
    for (const nodeId of order) {
      const node = nodes[nodeId]
      if (node === undefined) continue

      const kind = String(node["kind"] ?? "unknown")
      const inputs = nodeInputs(node, scope)
      const started = Date.now()

      emit("node_start", nodeId, {
        kind,
        description: node["description"] ?? null,
        slots: node["in"] ?? null,
        inputs,
      })

      const ctx: HandlerContext = {
        nodeId,
        node,
        ir,
        scope,
        inputs,
        required: requiredPathsOf(ir, nodeId),
        media: this.mediaFor(run.id, nodeId, ir),
        progress: (payload) => emit("node_progress", nodeId, payload),
      }

      const result = await this.runNode(ctx)
      if (result.failure !== null) {
        emit("node_fail", nodeId, { kind, ms: Date.now() - started, message: result.failure })
        return "error"
      }

      scope.values[nodeId] = { out: result.output }
      this.db.saveRender({
        runId: run.id,
        nodeId,
        input: inputs,
        output: result.output,
        prompt: result.prompt,
      })

      emit("node_finish", nodeId, {
        kind,
        status: "ok",
        ms: Date.now() - started,
        outputType: result.outputType,
        output: result.output,
        simplifications: [...result.simplifications, ...branchNotes(nodes, nodeId), ...retryNote(ir)],
      })
    }
    return "ok"
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
        prompt: null,
        simplifications: [],
        failure: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
