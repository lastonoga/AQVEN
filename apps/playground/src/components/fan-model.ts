import { resolveSlot } from "../refs/index.js"
import { isRecord } from "./ir-value.js"
import { formatParamValue, labelOf } from "./node-labels.js"
import { valueSummary } from "./ValueView.js"
import type { Ir, IrNode } from "../api/index.js"
import type { RunSnapshot } from "../refs/index.js"
import type { NodeStatus, RunNodeView } from "../run/events.js"

export const FAN_COLUMNS = 4
export const MAX_COLUMNS = 8

export type FanKind = "parallel" | "map" | "diverge"

export type FanCell = { known: boolean; value: unknown }

export type FanRender = { input: unknown; output: unknown; prompt?: string | null }

export type FanFacts = {
  nodes: ReadonlyMap<string, RunNodeView>
  renders: Readonly<Record<string, FanRender>>
  snapshot: RunSnapshot | null
}

export type FanBranch = {
  key: string
  label: string
  nodeId: string | null
  index: number | null
  axes: Readonly<Record<string, string>>
  input: FanCell
  prompt: string | null
  output: FanCell
  status: NodeStatus
  durationMs: number | null
  costMicros: number | null
  error: string | null
}

export type FanFact = { label: string; value: string }

export type FanRowKind = "axis" | "input" | "prompt" | "output" | "duration" | "cost" | "status"

export type FanRow = { id: string; kind: FanRowKind; label: string; axis: string }

export type FanModel = {
  kind: FanKind
  nodeId: string
  title: string
  branches: readonly FanBranch[]
  total: number
  picked: readonly number[]
  common: readonly FanFact[]
  sharedInput: FanCell | null
  sharedPrompt: string | null
  notes: readonly string[]
}

export type FanInput = {
  nodeId: string
  body: IrNode
  ir: Ir | null
  facts: FanFacts
  picked?: readonly number[]
}

const NO_CELL: FanCell = { known: false, value: undefined }

export const NO_FACTS: FanFacts = { nodes: new Map(), renders: {}, snapshot: null }

const titles: Record<FanKind, string> = {
  parallel: "параллельные ветки",
  map: "итерации map",
  diverge: "дивергентные ветки",
}

const enumTexts: Record<string, string> = {
  "join:all": "все",
  "join:any": "любая",
  "join:quorum": "кворум",
  "join:first_success": "первый успех",
  "onBranchError:fail": "прервать",
  "onBranchError:skip": "пропустить",
  "onBranchError:default": "значение по умолчанию",
  "visibility:isolated": "изолированная",
  "visibility:shared": "общая",
}

const extraLabels: Record<string, string> = {
  join: "Сведение",
  onBranchError: "Ошибка ветки",
  visibility: "Видимость",
  generator: "Генератор",
  n: "Веток",
  k: "Кворум",
  persona: "Персона",
  family: "Семейство",
  model: "Модель",
  topP: "top_p",
  item: "Элемент",
}

export const fanLabel = (key: string): string => extraLabels[key] ?? labelOf(key)

const factText = (key: string, value: unknown): string => {
  const named = typeof value === "string" ? enumTexts[`${key}:${value}`] : undefined
  if (named !== undefined) return named
  return formatParamValue(key, value)
}

const asFact = (key: string, value: unknown): FanFact[] => {
  const text = factText(key, value)
  if (text === "") return []
  return [{ label: fanLabel(key), value: text }]
}

const headOf = (ref: string): string => ref.slice(1).split(/[.[]/)[0] ?? ""

const irNodeOf = (value: unknown): IrNode | null => {
  if (!isRecord(value)) return null
  const kind = value["kind"]
  if (typeof kind !== "string") return null
  return { ...value, kind }
}

const nodeRefOf = (value: unknown): string | null => {
  if (typeof value === "string" && value.startsWith("$")) return headOf(value)
  if (isRecord(value) && typeof value["node"] === "string") return value["node"]
  return null
}

const refText = (value: unknown): string => {
  if (typeof value === "string") return value
  const node = nodeRefOf(value)
  return node === null ? "" : `$${node}.out`
}

const slotConst = (body: IrNode, slot: string): unknown => {
  const slots = body["in"]
  if (!isRecord(slots)) return undefined
  const value = slots[slot]
  if (!isRecord(value)) return undefined
  return value["const"]
}

const AXIS_FIELDS = ["modelRole", "fn", "tool", "component", "form", "trustIn"]

const scalarText = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (isRecord(value) || Array.isArray(value)) return valueSummary(value)
  return factText(key, value)
}

const overrideAxes = (body: IrNode): Array<[string, string]> => {
  const overrides = body["overrides"]
  if (!isRecord(overrides)) return []
  return Object.entries(overrides)
    .map(([key, value]): [string, string] => [key, scalarText(key, value)])
    .filter(([, text]) => text !== "")
}

const bodyAxes = (body: IrNode | null): Record<string, string> => {
  if (body === null) return {}
  const fields = AXIS_FIELDS.filter((key) => typeof body[key] === "string").map(
    (key): [string, string] => [key, factText(key, body[key])],
  )
  return Object.fromEntries([...fields, ...overrideAxes(body)])
}

const recordAxes = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]): [string, string] => [key, scalarText(key, item)])
      .filter(([, text]) => text !== ""),
  )
}

const stableKey = (value: unknown): string => {
  if (value === undefined) return "∅"
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`
  if (!isRecord(value)) return JSON.stringify(value) ?? "null"
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([key, item]) => `${key}:${stableKey(item)}`).join(",")}}`
}

const COST_FIELDS = ["usdMicros", "costMicros"]

const costOf = (node: RunNodeView | null): number | null => {
  if (node === null) return null
  const payloads = node.events.map((event) => event.payload).filter(isRecord)
  const found = payloads.flatMap((payload) => COST_FIELDS.map((field) => payload[field])).find(
    (value) => typeof value === "number",
  )
  return typeof found === "number" ? found : null
}

const inputCell = (node: RunNodeView | null, render: FanRender | undefined): FanCell => {
  if (render !== undefined && render.input !== undefined) return { known: true, value: render.input }
  if (node !== null && node.input !== undefined) return { known: true, value: node.input }
  return NO_CELL
}

const outputCell = (node: RunNodeView | null, render: FanRender | undefined): FanCell => {
  if (render !== undefined && render.output !== undefined) return { known: true, value: render.output }
  if (node !== null && node.output !== undefined) return { known: true, value: node.output }
  return NO_CELL
}

const derivedStatus = (owner: RunNodeView | null, known: boolean): NodeStatus => {
  if (known) return "ok"
  if (owner === null) return "pending"
  if (owner.status === "ok") return "skipped"
  return owner.status
}

const branchOfNode = (key: string, label: string, nodeId: string, input: FanInput): FanBranch => {
  const node = input.facts.nodes.get(nodeId) ?? null
  const render = input.facts.renders[nodeId]
  const body = input.ir?.nodes[nodeId] ?? null
  return {
    key,
    label,
    nodeId,
    index: null,
    axes: bodyAxes(body),
    input: inputCell(node, render),
    prompt: render?.prompt ?? null,
    output: outputCell(node, render),
    status: node?.status ?? derivedStatus(null, outputCell(node, render).known),
    durationMs: node?.durationMs ?? null,
    costMicros: costOf(node),
    error: node?.error ?? null,
  }
}

const parallelPairs = (body: IrNode): Array<[string, string]> => {
  const branches = body["branches"]
  if (!isRecord(branches)) return []
  return Object.entries(branches).flatMap(([key, value]): Array<[string, string]> => {
    const nodeId = nodeRefOf(value)
    return nodeId === null ? [] : [[key, nodeId]]
  })
}

const FAN_FACT_FIELDS: Record<FanKind, readonly string[]> = {
  parallel: ["join", "k", "concurrency", "onBranchError"],
  map: ["itemType", "concurrency", "onItemError", "maxItems"],
  diverge: ["component"],
}

const bodyFacts = (kind: FanKind, body: IrNode): FanFact[] =>
  FAN_FACT_FIELDS[kind].flatMap((field) => asFact(field, body[field]))

const sharedAxes = (branches: readonly FanBranch[]): FanFact[] => {
  const keys = axisKeysOf(branches)
  return keys
    .filter((key) => sameAxis(branches, key))
    .flatMap((key) => {
      const value = branches[0]?.axes[key] ?? ""
      return value === "" ? [] : [{ label: fanLabel(key), value }]
    })
}

const axisKeysOf = (branches: readonly FanBranch[]): string[] => {
  const keys: string[] = []
  for (const branch of branches) {
    for (const key of Object.keys(branch.axes)) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

const sameAxis = (branches: readonly FanBranch[], key: string): boolean => {
  const first = branches[0]?.axes[key]
  return branches.every((branch) => branch.axes[key] === first)
}

const sameCells = (cells: readonly FanCell[]): boolean => {
  const first = cells[0]
  if (first === undefined) return false
  if (!first.known) return false
  const key = stableKey(first.value)
  return cells.every((cell) => cell.known && stableKey(cell.value) === key)
}

const sharedInputOf = (branches: readonly FanBranch[]): FanCell | null => {
  if (branches.length < 2) return null
  const cells = branches.map((branch) => branch.input)
  if (!sameCells(cells)) return null
  return cells[0] ?? null
}

const sharedPromptOf = (branches: readonly FanBranch[]): string | null => {
  const first = branches[0]?.prompt ?? null
  if (first === null) return null
  return branches.every((branch) => branch.prompt === first) ? first : null
}

const modelOf = (
  kind: FanKind,
  input: FanInput,
  branches: readonly FanBranch[],
  total: number,
  picked: readonly number[],
  facts: readonly FanFact[],
  notes: readonly string[],
): FanModel => ({
  kind,
  nodeId: input.nodeId,
  title: titles[kind],
  branches,
  total,
  picked,
  common: [...facts, ...sharedAxes(branches)],
  sharedInput: sharedInputOf(branches),
  sharedPrompt: sharedPromptOf(branches),
  notes,
})

const promptNote = (branches: readonly FanBranch[], text: string): string[] =>
  branches.every((branch) => branch.prompt === null) ? [text] : []

const buildParallel = (input: FanInput): FanModel | null => {
  const pairs = parallelPairs(input.body)
  if (pairs.length === 0) return null
  const branches = pairs.map(([key, nodeId]) => branchOfNode(key, key, nodeId, input))
  const notes = promptNote(branches, "промты веток в этом прогоне не записаны")
  return modelOf("parallel", input, branches, branches.length, range(branches.length), bodyFacts("parallel", input.body), notes)
}

type VaryAxis = { key: string; values: readonly unknown[] }

const varyOf = (body: IrNode): VaryAxis | null => {
  const vary = slotConst(body, "vary")
  if (!isRecord(vary)) return null
  const first = Object.entries(vary)[0]
  if (first === undefined) return null
  const [key, values] = first
  if (!Array.isArray(values)) return null
  return { key, values }
}

const divergeCount = (body: IrNode): number => {
  const declared = slotConst(body, "n")
  if (typeof declared === "number") return declared
  return varyOf(body)?.values.length ?? 0
}

const elementAt = (cell: FanCell, index: number): FanCell => {
  if (!cell.known) return NO_CELL
  if (!Array.isArray(cell.value)) return NO_CELL
  if (index >= cell.value.length) return NO_CELL
  return { known: true, value: cell.value[index] }
}

const divergeAxes = (vary: VaryAxis | null, index: number): Record<string, string> => {
  if (vary === null) return {}
  const value = vary.values[index]
  if (value === undefined) return {}
  return { [vary.key]: scalarText(vary.key, value) }
}

const divergeLabel = (vary: VaryAxis | null, index: number): string => {
  if (vary === null) return `ветка ${index + 1}`
  const value = vary.values[index]
  if (value === undefined) return `ветка ${index + 1}`
  return `${fanLabel(vary.key)} ${scalarText(vary.key, value)}`
}

const generatorFacts = (body: IrNode): FanFact[] => {
  const params = body["params"]
  if (!isRecord(params)) return []
  return Object.entries(params).flatMap(([role, value]) => {
    if (!isRecord(value) || typeof value["component"] !== "string") return []
    return [{ label: fanLabel(role), value: value["component"] }]
  })
}

const buildDiverge = (input: FanInput): FanModel | null => {
  const total = divergeCount(input.body)
  if (total < 2) return null
  const node = input.facts.nodes.get(input.nodeId) ?? null
  const render = input.facts.renders[input.nodeId]
  const shared = inputCell(node, render)
  const outputs = outputCell(node, render)
  const vary = varyOf(input.body)
  const generator = bodyAxes(generatorBody(input))
  const branches = range(total).map((index): FanBranch => {
    const output = elementAt(outputs, index)
    return {
      key: `b${index}`,
      label: divergeLabel(vary, index),
      nodeId: null,
      index,
      axes: { ...generator, ...divergeAxes(vary, index) },
      input: shared,
      prompt: render?.prompt ?? null,
      output,
      status: derivedStatus(node, output.known),
      durationMs: null,
      costMicros: null,
      error: node?.error ?? null,
    }
  })
  const facts = [
    ...bodyFacts("diverge", input.body),
    ...generatorFacts(input.body),
    ...asFact("visibility", slotConst(input.body, "visibility")),
  ]
  const notes = [
    "исполнитель пишет один промт и один массив выходов на весь вызов: по веткам развёрнут выход, промт общий",
  ]
  return modelOf("diverge", input, branches, total, range(total), facts, notes)
}

const generatorBody = (input: FanInput): IrNode | null => {
  const params = input.body["params"]
  if (!isRecord(params)) return null
  const first = Object.values(params).find((value) => isRecord(value) && typeof value["component"] === "string")
  if (!isRecord(first)) return null
  const component = input.ir?.components[String(first["component"])]
  if (component === undefined) return null
  const nodes = Object.values(component.nodes)
  return nodes[0] ?? null
}

const progressOf = (node: RunNodeView | null): Map<number, { at: number; output: unknown }> => {
  const found = new Map<number, { at: number; output: unknown }>()
  if (node === null) return found
  for (const event of node.events) {
    if (event.type !== "node_progress") continue
    const payload = isRecord(event.payload) ? event.payload : {}
    const index = payload["index"]
    if (typeof index !== "number") continue
    found.set(index, { at: event.at, output: payload["output"] })
  }
  return found
}

const iterationDuration = (
  node: RunNodeView | null,
  progress: ReadonlyMap<number, { at: number; output: unknown }>,
  index: number,
): number | null => {
  const here = progress.get(index)
  if (here === undefined) return null
  const previous = index === 0 ? (node?.startedAt ?? null) : (progress.get(index - 1)?.at ?? null)
  if (previous === null) return null
  return here.at - previous
}

const itemsOfMap = (input: FanInput): unknown[] => {
  const render = input.facts.renders[input.nodeId]
  const slots = render === undefined ? null : render.input
  const recorded = isRecord(slots) ? slots["over"] : undefined
  if (Array.isArray(recorded)) return recorded
  if (input.ir === null) return []
  const slot = resolveSlot("over", input.body["over"], input.ir, input.facts.snapshot, { nodeId: input.nodeId })
  const value = slot.value?.value
  return Array.isArray(value) ? value : []
}

const iterationInput = (input: FanInput, inner: IrNode, index: number, item: unknown): FanCell => {
  const slots = inner["in"]
  if (!isRecord(slots) || input.ir === null) return item === undefined ? NO_CELL : { known: true, value: item }
  const ir = input.ir
  const entries = Object.entries(slots).map(([name, raw]): [string, unknown] => {
    const provenance = resolveSlot(name, raw, ir, input.facts.snapshot, { nodeId: input.nodeId, index })
    return [name, provenance.value?.value]
  })
  const known = entries.some(([, value]) => value !== undefined)
  if (!known) return item === undefined ? NO_CELL : { known: true, value: item }
  return { known: true, value: Object.fromEntries(entries) }
}

const iterationAxes = (item: unknown, inner: IrNode | null): Record<string, string> => {
  const fields = recordAxes(item)
  if (Object.keys(fields).length > 0) return { ...bodyAxes(inner), ...fields }
  const text = scalarText("item", item)
  if (text === "") return bodyAxes(inner)
  return { ...bodyAxes(inner), item: text }
}

export const range = (total: number): number[] => Array.from({ length: total }, (_, index) => index)

const pickedOf = (total: number, picked: readonly number[] | undefined): number[] => {
  const fallback = range(Math.min(total, FAN_COLUMNS))
  if (picked === undefined) return fallback
  const valid = [...new Set(picked)].filter((index) => index >= 0 && index < total).sort((a, b) => a - b)
  if (valid.length === 0) return fallback
  return valid.slice(0, MAX_COLUMNS)
}

const buildMap = (input: FanInput): FanModel | null => {
  const body = irNodeOf(input.body["do"])
  if (body === null) return null
  const node = input.facts.nodes.get(input.nodeId) ?? null
  const items = itemsOfMap(input)
  const progress = progressOf(node)
  const outputs = outputCell(node, input.facts.renders[input.nodeId])
  const total = Math.max(items.length, progress.size, node?.progress?.total ?? 0)
  const picked = pickedOf(total, input.picked)
  const branches = picked.map((index): FanBranch => {
    const item = items[index]
    const recorded = progress.get(index)
    const output = recorded === undefined ? elementAt(outputs, index) : { known: true, value: recorded.output }
    return {
      key: `i${index}`,
      label: `итерация ${index + 1}`,
      nodeId: null,
      index,
      axes: iterationAxes(item, body),
      input: iterationInput(input, body, index, item),
      prompt: null,
      output,
      status: derivedStatus(node, output.known),
      durationMs: iterationDuration(node, progress, index),
      costMicros: null,
      error: node?.error ?? null,
    }
  })
  const facts = [...bodyFacts("map", input.body), ...asFact("over", refText(input.body["over"]))]
  const notes = [
    ...promptNote(branches, "исполнитель не пишет промт по итерации: в записи прогона только вход и выход"),
  ]
  return modelOf("map", input, branches, total, picked, facts, notes)
}

const builders: Record<string, (input: FanInput) => FanModel | null> = {
  parallel: buildParallel,
  map: buildMap,
  call: buildDiverge,
}

export const isFanNode = (body: IrNode | null): boolean => {
  if (body === null) return false
  if (body.kind === "parallel") return parallelPairs(body).length > 0
  if (body.kind === "map") return isRecord(body["do"])
  if (body.kind === "call") return divergeCount(body) > 1
  return false
}

export const fanOf = (input: FanInput): FanModel | null => {
  const builder = builders[input.body.kind]
  if (builder === undefined) return null
  return builder(input)
}

const tailRows: readonly FanRow[] = [
  { id: "output", kind: "output", label: "Выход", axis: "" },
  { id: "duration", kind: "duration", label: "Время", axis: "" },
  { id: "cost", kind: "cost", label: "Стоимость", axis: "" },
  { id: "status", kind: "status", label: "Статус", axis: "" },
]

const inputRows = (model: FanModel): FanRow[] =>
  model.sharedInput === null ? [{ id: "input", kind: "input", label: "Вход", axis: "" }] : []

const promptRows = (model: FanModel): FanRow[] => {
  if (model.sharedPrompt !== null) return []
  if (model.branches.every((branch) => branch.prompt === null)) return []
  return [{ id: "prompt", kind: "prompt", label: "Промт", axis: "" }]
}

export const fanRows = (model: FanModel): readonly FanRow[] => {
  const axes = axisKeysOf(model.branches)
    .filter((key) => !sameAxis(model.branches, key))
    .map((key): FanRow => ({ id: `axis:${key}`, kind: "axis", label: fanLabel(key), axis: key }))
  return [...axes, ...inputRows(model), ...promptRows(model), ...tailRows]
}
