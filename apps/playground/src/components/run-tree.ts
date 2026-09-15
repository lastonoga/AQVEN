import { buildSteps } from "./run-steps.js"
import type { FlowCheck, FlowGroup, FlowItem, FlowTree } from "./flow-view.js"
import type { RunStep } from "./run-steps.js"
import type { Render, RunEvent } from "../api/index.js"
import type { RunView } from "../run/events.js"

type Bag = Record<string, unknown>

const bagOf = (value: unknown): Bag | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Bag) : null

const textOf = (bag: Bag | null, key: string): string | null => {
  const value = bag?.[key]
  return typeof value === "string" && value !== "" ? value : null
}

const numberOf = (bag: Bag | null, key: string): number | null => {
  const value = bag?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const flagOf = (bag: Bag | null, key: string): boolean => bag?.[key] === true

const checksOf = (bag: Bag | null): FlowCheck[] => {
  const raw = bag?.["checks"]
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    const check = bagOf(entry)
    if (check === null) return []
    return [
      {
        name: textOf(check, "name") ?? "проверка",
        ok: typeof check["ok"] === "boolean" ? (check["ok"] as boolean) : null,
        message: textOf(check, "message") ?? "",
      },
    ]
  })
}

const statusOf = (bag: Bag | null): FlowItem["status"] =>
  textOf(bag, "status") === "error" ? "error" : "ok"

const eventsOfType = (events: readonly RunEvent[], type: string): { event: RunEvent; payload: Bag | null }[] =>
  events.filter((event) => event.type === type).map((event) => ({ event, payload: bagOf(event.payload) }))

const renderAt = (renders: Readonly<Record<string, Render>>, key: string): Render | undefined => renders[key]

type Context = {
  renders: Readonly<Record<string, Render>>
  events: ReadonlyMap<string, readonly RunEvent[]>
  steps: ReadonlyMap<string, RunStep>
  startedAt: number | null
  order: { next: number }
}

const offsetOf = (startedAt: number | null, at: number | null): number | null => {
  if (startedAt === null || at === null) return null
  return Math.max(0, at - startedAt)
}

const EMPTY_GROUPS: readonly FlowGroup[] = []

export const branchChildren = (view: RunView): Set<string> => {
  const found = new Set<string>()
  for (const node of view.nodes) {
    for (const event of node.events) {
      if (event.type !== "branch_finish" && event.type !== "branch_start") continue
      const child = textOf(bagOf(event.payload), "nodeId")
      if (child !== null) found.add(child)
    }
  }
  return found
}

const branchItems = (step: RunStep, events: readonly RunEvent[], context: Context): FlowItem[] => {
  const starts = new Map(
    eventsOfType(events, "branch_start").map(({ event, payload }) => [
      textOf(payload, "branchKey") ?? String(event.seq),
      { event, payload },
    ]),
  )
  return eventsOfType(events, "branch_finish").map(({ event, payload }) => {
    const key = textOf(payload, "branchKey") ?? String(event.seq)
    const start = starts.get(key)
    const childId = textOf(payload, "nodeId")
    const child = childId === null ? undefined : context.steps.get(childId)
    const render = renderAt(context.renders, `${step.nodeId}#${key}`)
    const startedAt = numberOf(start?.payload ?? null, "startedAt") ?? start?.event.at ?? null
    const endedAt = numberOf(payload, "endedAt") ?? event.at
    return {
      id: `${step.nodeId}#${key}`,
      kind: "branch" as const,
      nodeId: childId ?? step.nodeId,
      order: context.order.next++,
      title: child?.summary ?? textOf(start?.payload ?? null, "description") ?? `ветка ${key}`,
      note: "",
      nodeKind: child?.kind ?? step.kind,
      status: statusOf(payload),
      offsetMs: offsetOf(context.startedAt, startedAt),
      durationMs: numberOf(payload, "ms") ?? offsetOf(startedAt, endedAt),
      totalTokens: child?.metrics.totalTokens ?? null,
      costUsd: child?.metrics.costUsd ?? null,
      model: textOf(payload, "model"),
      params: bagOf(payload?.["params"]),
      input: render?.input ?? child?.input ?? step.input,
      prompt: render?.prompt ?? child?.prompt ?? null,
      output: render?.output ?? child?.output ?? payload?.["output"],
      outputType: child?.outputType ?? step.outputType,
      checks: child?.checks ?? checksOf(payload),
      error: child?.error ?? null,
      score: null,
      selected: flagOf(payload, "counted"),
      stopReason: null,
      groups: EMPTY_GROUPS,
    }
  })
}

const iterationItems = (step: RunStep, events: readonly RunEvent[], context: Context): FlowItem[] => {
  const starts = new Map(
    eventsOfType(events, "iteration_start").map(({ payload }) => [numberOf(payload, "iter") ?? 0, payload]),
  )
  const startAt = new Map(
    eventsOfType(events, "iteration_start").map(({ event, payload }) => [numberOf(payload, "iter") ?? 0, event.at]),
  )
  return eventsOfType(events, "iteration_finish").map(({ event, payload }) => {
    const iter = numberOf(payload, "iter") ?? 0
    const began = startAt.get(iter) ?? null
    const total = numberOf(payload, "total") ?? 0
    const render = renderAt(context.renders, `${step.nodeId}@${iter}`)
    const stop = textOf(payload, "stopReason")
    return {
      id: `${step.nodeId}@${iter}`,
      kind: "iteration" as const,
      nodeId: step.nodeId,
      order: context.order.next++,
      title: `итерация ${iter + 1} из ${total}`,
      note: stop === null ? "" : `остановка: ${stop}`,
      nodeKind: step.kind,
      status: statusOf(payload),
      offsetMs: offsetOf(context.startedAt, began),
      durationMs: offsetOf(began, event.at),
      totalTokens: null,
      costUsd: null,
      model: null,
      params: null,
      input: render?.input ?? starts.get(iter)?.["carry"],
      prompt: render?.prompt ?? null,
      output: render?.output ?? payload?.["output"],
      outputType: step.outputType,
      checks: [],
      error: null,
      score: numberOf(payload, "score"),
      selected: flagOf(payload, "selected"),
      stopReason: stop,
      groups: EMPTY_GROUPS,
    }
  })
}

const gateItems = (step: RunStep, events: readonly RunEvent[], context: Context): FlowItem[] =>
  eventsOfType(events, "gate_wait").map(({ event, payload }) => ({
    id: `${step.nodeId}!gate`,
    kind: "gate" as const,
    nodeId: step.nodeId,
    order: context.order.next++,
    title: `ждёт решения: ${textOf(payload, "role") ?? textOf(payload, "waitFor") ?? "человек"}`,
    note: [textOf(payload, "assignee"), textOf(payload, "onTimeout")].filter((part) => part !== null).join(" · "),
    nodeKind: step.kind,
    status: "pending" as const,
    offsetMs: offsetOf(context.startedAt, event.at),
    durationMs: null,
    totalTokens: null,
    costUsd: null,
    model: null,
    params: null,
    input: undefined,
    prompt: null,
    output: undefined,
    outputType: null,
    checks: [],
    error: null,
    score: null,
    selected: false,
    stopReason: null,
    groups: EMPTY_GROUPS,
  }))

const spanOf = (items: readonly FlowItem[]): { offsetMs: number | null; durationMs: number | null } => {
  const offsets = items.flatMap((item) => (item.offsetMs === null ? [] : [item.offsetMs]))
  if (offsets.length === 0) return { offsetMs: null, durationMs: null }
  const from = Math.min(...offsets)
  const to = Math.max(...items.map((item) => (item.offsetMs ?? from) + (item.durationMs ?? 0)))
  return { offsetMs: from, durationMs: Math.max(to - from, 0) }
}

const lanesOf = (items: readonly FlowItem[]): number => {
  const spans = items.flatMap((item) =>
    item.offsetMs === null ? [] : [{ from: item.offsetMs, to: item.offsetMs + (item.durationMs ?? 0) }],
  )
  return spans.reduce(
    (most, span) => Math.max(most, spans.filter((other) => other.from < span.to && span.from < other.to).length),
    items.length === 0 ? 0 : 1,
  )
}

const groupOf = (id: string, mode: FlowGroup["mode"], label: string, items: readonly FlowItem[]): FlowGroup => ({
  id,
  mode,
  label,
  ...spanOf(items),
  lanes: lanesOf(items),
  items,
})

const childrenOf = (step: RunStep, context: Context): FlowGroup[] => {
  const events = context.events.get(step.nodeId) ?? []
  const branches = branchItems(step, events, context)
  const iterations = iterationItems(step, events, context)
  const gates = gateItems(step, events, context)
  return [
    branches.length === 0 ? null : groupOf(`${step.nodeId}:branches`, "parallel", "", branches),
    iterations.length === 0 ? null : groupOf(`${step.nodeId}:iterations`, "loop", stopLabel(iterations), iterations),
    gates.length === 0 ? null : groupOf(`${step.nodeId}:gate`, "sequence", "", gates),
  ].filter((group): group is FlowGroup => group !== null)
}

const stopLabel = (items: readonly FlowItem[]): string => {
  const chosen = items.find((item) => item.selected)
  const stopped = items.find((item) => item.stopReason !== null)
  return [
    chosen === undefined ? "" : `выбрана ${chosen.title}`,
    stopped?.stopReason === undefined || stopped.stopReason === null ? "" : `остановка по ${stopped.stopReason}`,
  ]
    .filter((part) => part !== "")
    .join(" · ")
}

const itemOf = (step: RunStep, context: Context): FlowItem => ({
  id: step.nodeId,
  kind: "step",
  nodeId: step.nodeId,
  order: context.order.next++,
  title: step.summary ?? step.description ?? step.nodeId,
  note: "",
  nodeKind: step.kind,
  status: step.status,
  offsetMs: offsetOf(context.startedAt, step.startedAt),
  durationMs: step.durationMs,
  totalTokens: step.metrics.totalTokens,
  costUsd: step.metrics.costUsd,
  model: null,
  params: null,
  input: step.input,
  prompt: step.prompt,
  output: step.output,
  outputType: step.outputType,
  checks: step.checks,
  error: step.error,
  score: null,
  selected: false,
  stopReason: null,
  groups: childrenOf(step, context),
})

const bucketed = (items: readonly FlowItem[]): FlowItem[][] =>
  [...items]
    .sort((left, right) => (left.offsetMs ?? 0) - (right.offsetMs ?? 0))
    .reduce<FlowItem[][]>((buckets, item) => {
      const last = buckets[buckets.length - 1]
      if (last === undefined) return [[item]]
      const reach = Math.max(...last.map((entry) => (entry.offsetMs ?? 0) + (entry.durationMs ?? 0)))
      if ((item.offsetMs ?? 0) < reach) return [...buckets.slice(0, -1), [...last, item]]
      return [...buckets, [item]]
    }, [])

const merged = (buckets: readonly FlowItem[][]): FlowGroup[] =>
  buckets.reduce<FlowGroup[]>((groups, bucket, index) => {
    if (bucket.length > 1) return [...groups, groupOf(`p${index}`, "parallel", "", bucket)]
    const last = groups[groups.length - 1]
    if (last !== undefined && last.mode === "sequence") {
      return [...groups.slice(0, -1), groupOf(last.id, "sequence", "", [...last.items, ...bucket])]
    }
    return [...groups, groupOf(`s${index}`, "sequence", "", bucket)]
  }, [])

export const buildRunTree = (view: RunView, renders: Readonly<Record<string, Render>>): FlowTree => {
  const steps = buildSteps(view, renders)
  const context: Context = {
    renders,
    events: new Map(view.nodes.map((node) => [node.nodeId, node.events])),
    steps: new Map(steps.map((step) => [step.nodeId, step])),
    startedAt: view.startedAt,
    order: { next: 1 },
  }
  const nested = branchChildren(view)
  const items = steps.filter((step) => !nested.has(step.nodeId)).map((step) => itemOf(step, context))
  return { groups: merged(bucketed(items)), startedAt: view.startedAt, durationMs: view.durationMs }
}
