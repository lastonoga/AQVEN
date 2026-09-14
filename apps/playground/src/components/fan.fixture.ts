import type { Ir, IrNode, Render, Run, RunEvent } from "../api/index.js"
import type { NodeStatus, RunNodeView } from "../run/events.js"
import type { RunSelection } from "../run-context.js"
import type { FanFacts } from "./fan-model.js"

export const fanNodes: Record<string, IrNode> = {
  variants: { kind: "code", fn: "expand_vary", out: "CallOverrides[]", in: {} },
  solutions: {
    kind: "map",
    over: "$variants.out",
    itemType: "CallOverrides",
    concurrency: 5,
    onItemError: "skip",
    do: {
      kind: "llm",
      fn: "solve_problem",
      modelRole: "small_fast",
      overrides: "$item",
      in: { problem: "$input", overrides: "$item" },
    },
  },
  opinions: {
    kind: "parallel",
    branches: { openai: { node: "opinion_openai" }, anthropic: { node: "opinion_anthropic" } },
    join: "all",
    concurrency: 4,
    onBranchError: "fail",
  },
  opinion_openai: {
    kind: "llm",
    fn: "write_opinion",
    modelRole: "writer_openai",
    overrides: { temperature: 0.9, maxOutputTokens: 600 },
    in: { brief: "$variants.out" },
  },
  opinion_anthropic: {
    kind: "llm",
    fn: "write_opinion",
    modelRole: "writer_anthropic",
    overrides: { temperature: 0.8, maxOutputTokens: 600 },
    in: { brief: "$variants.out" },
  },
  drafts: {
    kind: "call",
    component: "diverge",
    params: { generator: { component: "idea_set" } },
    out: "IdeaSet[]",
    in: {
      task: "$variants.out",
      n: { const: 4 },
      vary: { const: { persona: ["analyst", "marketer", "engineer", "support_lead"] } },
      visibility: { const: "isolated" },
    },
  },
}

export const fanIr: Ir = {
  flow: "demo",
  version: 1,
  input: "Problem",
  output: { type: "Answer", from: "$drafts.out" },
  components: {},
  nodes: fanNodes,
}

export const fanItems: readonly { seed: number }[] = [
  { seed: 11 },
  { seed: 22 },
  { seed: 33 },
  { seed: 44 },
  { seed: 55 },
]

export const fanInput = { question: "куда вложить" }

const progressEvent = (index: number, at: number): RunEvent => ({
  seq: index + 2,
  at,
  type: "node_progress",
  nodeId: "solutions",
  payload: { index, total: fanItems.length, output: { answer: `решение ${index + 1}` } },
})

const runNode = (nodeId: string, status: NodeStatus, extra: Partial<RunNodeView> = {}): RunNodeView => ({
  nodeId,
  kind: null,
  description: null,
  status,
  order: 0,
  startedAt: 1000,
  endedAt: 2000,
  durationMs: 1000,
  progress: null,
  simplifications: [],
  slots: null,
  input: undefined,
  output: undefined,
  outputType: null,
  error: null,
  events: [],
  ...extra,
})

const render = (nodeId: string, input: unknown, output: unknown, prompt: string | null): Render => ({
  runId: "run-1",
  nodeId,
  input,
  output,
  prompt,
})

export const fanRenders: Readonly<Record<string, Render>> = {
  variants: render("variants", {}, fanItems, null),
  solutions: render(
    "solutions",
    { over: fanItems },
    fanItems.map((_, index) => ({ answer: `решение ${index + 1}` })),
    null,
  ),
  opinion_openai: render(
    "opinion_openai",
    { brief: { topic: "рынок" } },
    { stance: "buy", thesis: "брать" },
    "роль writer температура 0.9 задача мнение",
  ),
  opinion_anthropic: render(
    "opinion_anthropic",
    { brief: { topic: "рынок" } },
    { stance: "hold", thesis: "ждать" },
    "роль writer температура 0.8 задача мнение",
  ),
  drafts: render(
    "drafts",
    { task: { topic: "рынок" }, n: 4 },
    [{ ideas: 1 }, { ideas: 2 }, { ideas: 3 }, { ideas: 4 }],
    "общий промт дивергенции",
  ),
}

export const fanRunNodes: ReadonlyMap<string, RunNodeView> = new Map([
  [
    "solutions",
    runNode("solutions", "ok", { events: fanItems.map((_, index) => progressEvent(index, 1100 + index * 200)) }),
  ],
  ["opinion_openai", runNode("opinion_openai", "ok", { durationMs: 640 })],
  ["opinion_anthropic", runNode("opinion_anthropic", "error", { durationMs: 120, error: "ветка не ответила" })],
  ["drafts", runNode("drafts", "ok", { durationMs: 900 })],
])

export const fanFacts: FanFacts = {
  nodes: fanRunNodes,
  renders: fanRenders,
  snapshot: { input: fanInput, renders: fanRenders },
}

export const emptyFacts: FanFacts = { nodes: new Map(), renders: {}, snapshot: null }

const run: Run = { id: "run-1", flow: "demo", input: fanInput, status: "ok", startedAt: 1000, endedAt: 2200 }

export const fanSelection: RunSelection = {
  runId: run.id,
  run,
  view: null,
  nodes: fanRunNodes,
  renders: fanRenders,
  loading: false,
  error: null,
}
