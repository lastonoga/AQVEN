import type { ApiNodeDetail } from "@/domain"
import { functionName } from "./node-tree"

export type NodeSpec = ApiNodeDetail["spec"]
export type NodeSpecKind = NodeSpec["node"]

export const FACT_KEYS = [
  "agent",
  "inference",
  "run",
  "tool",
  "assignee",
  "form",
  "timeout",
  "onTimeout",
  "branches",
  "join",
  "over",
  "body",
  "concurrency",
  "onItemError",
  "maxIter",
  "stop",
  "select",
  "on",
  "cases",
  "flow",
  "from",
  "to",
] as const

export type FactKey = (typeof FACT_KEYS)[number]

export type NodeFact = { readonly key: FactKey; readonly text: string; readonly mono: boolean }

type Policy = {
  readonly use?: string | null
  readonly run?: string | null
  readonly with?: Readonly<Record<string, unknown>> | null
}

type Timeout =
  | { readonly policy: "fail" }
  | { readonly policy: "default" }
  | { readonly policy: "escalate"; readonly assignee: string }

type SpecOf<K extends NodeSpecKind> = { [P in K]: Extract<NodeSpec, { readonly node: P }> }[K]

type FactStrategies = { readonly [K in NodeSpecKind]: (spec: SpecOf<K>) => readonly NodeFact[] }

const SEPARATOR = ", "

const fact = (key: FactKey, text: string | null): readonly NodeFact[] =>
  text === null || text === "" ? [] : [{ key, text, mono: false }]

const refFact = (key: FactKey, text: string | null): readonly NodeFact[] =>
  text === null || text === "" ? [] : [{ key, text, mono: true }]

const valueText = (value: unknown): string => {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

const policyArguments = (values: Readonly<Record<string, unknown>> | null | undefined): string => {
  if (values === null || values === undefined) return ""
  return Object.entries(values)
    .map(([key, value]) => `${key}=${valueText(value)}`)
    .join(SEPARATOR)
}

const policyText = (policy: Policy): string => {
  const name = policy.use ?? (policy.run === null || policy.run === undefined ? "" : functionName(policy.run))
  const args = policyArguments(policy.with)
  return args === "" ? name : `${name}(${args})`
}

const policiesText = (policies: readonly Policy[] | null | undefined): string =>
  (policies ?? []).map(policyText).join(SEPARATOR)

const timeoutText = (timeout: Timeout): string =>
  timeout.policy === "escalate" ? `escalate(${timeout.assignee})` : timeout.policy

const countText = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : String(value)

export const NODE_FACTS: FactStrategies = {
  llm: (spec) => [...fact("agent", spec.agent), ...fact("inference", spec.inference ?? null)],
  code: (spec) => refFact("run", functionName(spec.run)),
  tool: (spec) => fact("tool", spec.tool),
  human: (spec) => [
    ...fact("assignee", spec.assignee),
    ...fact("form", spec.form),
    ...fact("timeout", String(spec.timeout_seconds)),
    ...fact("onTimeout", timeoutText(spec.on_timeout)),
  ],
  parallel: (spec) => [
    ...fact("branches", Object.keys(spec.body).join(SEPARATOR)),
    ...fact("join", policyText(spec.join)),
  ],
  map: (spec) => [
    ...refFact("over", spec.over),
    ...fact("body", spec.body),
    ...fact("concurrency", countText(spec.concurrency)),
    ...fact("onItemError", policyText(spec.on_item_error)),
  ],
  loop: (spec) => [
    ...fact("body", spec.body.join(SEPARATOR)),
    ...fact("maxIter", String(spec.max_iter)),
    ...fact("stop", policiesText(spec.stop)),
    ...fact("select", policyText(spec.select)),
  ],
  switch: (spec) => [...refFact("on", spec.on), ...fact("cases", Object.keys(spec.cases).join(SEPARATOR))],
  call: (spec) => fact("flow", spec.flow),
  narrow: (spec) => [...refFact("from", spec.from), ...fact("to", spec.to)],
}

export const nodeFacts = <K extends NodeSpecKind>(spec: SpecOf<K>): readonly NodeFact[] => {
  const build: (spec: SpecOf<K>) => readonly NodeFact[] = NODE_FACTS[spec.node]
  return build(spec)
}

export const specDescription = (spec: NodeSpec): string => spec.description
