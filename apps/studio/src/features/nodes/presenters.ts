import type { ApiDiagnostic, ApiNodeDetail, ApiPrompt, ApiPromptDetail } from "@/domain"
import type { Tone } from "@/components/studio"
import { jsonText, schemaFields } from "./json-schema"
import type { NodeSpec } from "./node-facts"
import { fileStem, functionName } from "./node-tree"

export type BindingOrigin = "input" | "node" | "run" | "iter" | "branch" | "literal" | "unbound"

export type BindingRow = {
  readonly slot: string
  readonly typeLabel: string
  readonly origin: BindingOrigin
  readonly source: string
  readonly required: boolean
}

export type OutputRow = {
  readonly name: string
  readonly typeLabel: string
  readonly description: string
  readonly dynamic: boolean
}

export type Resolution = { readonly bound: number; readonly total: number; readonly tone: Tone }

export type PromptGroup = {
  readonly key: string
  readonly label: string
  readonly level: number | null
  readonly nodeIds: readonly string[]
}

type DeclaredInput = { readonly name: string; readonly type?: string }
type DeclaredOutput = { readonly name: string; readonly type: string; readonly description: string }
type TypeEntry = readonly [string, string]

const REF_HEAD = /^\$([a-z0-9_]+)/i

const HEAD_ORIGIN: Readonly<Record<string, BindingOrigin>> = {
  input: "input",
  run: "run",
  iter: "iter",
  ok: "branch",
  err: "branch",
}

export const declaredInputs = (spec: NodeSpec): readonly DeclaredInput[] => ("in" in spec ? (spec.in ?? []) : [])

export const declaredOutputs = (spec: NodeSpec): readonly DeclaredOutput[] => ("out" in spec ? spec.out : [])

export const bindingOrigin = (ref: string | null, value: unknown): BindingOrigin => {
  if (ref === null) return value === null || value === undefined ? "unbound" : "literal"
  const head = REF_HEAD.exec(ref)?.[1] ?? ""
  return HEAD_ORIGIN[head] ?? "node"
}

export const producerId = (ref: string): string | null => {
  const head = REF_HEAD.exec(ref)?.[1] ?? ""
  return HEAD_ORIGIN[head] === undefined && head !== "" ? head : null
}

const schemaTypeEntries = (schema: unknown): readonly TypeEntry[] =>
  schemaFields(schema).map((field): TypeEntry => [field.name, field.typeLabel])

const specTypeEntries = (spec: NodeSpec): readonly TypeEntry[] =>
  declaredInputs(spec).flatMap((field): readonly TypeEntry[] => (field.type === undefined ? [] : [[field.name, field.type]]))

const promptTypeEntries = (prompt: ApiPromptDetail | null): readonly TypeEntry[] =>
  (prompt?.slots ?? []).map((slot): TypeEntry => [slot.name, slot.type_id])

const slotTypes = (detail: ApiNodeDetail, prompt: ApiPromptDetail | null): ReadonlyMap<string, string> =>
  new Map([...schemaTypeEntries(detail.in_schema), ...specTypeEntries(detail.spec), ...promptTypeEntries(prompt)])

export const bindingRows = (detail: ApiNodeDetail, prompt: ApiPromptDetail | null): readonly BindingRow[] => {
  const types = slotTypes(detail, prompt)
  const required = new Set(schemaFields(detail.in_schema).filter((field) => field.required).map((field) => field.name))
  return detail.bindings.map((binding) => ({
    slot: binding.slot,
    typeLabel: types.get(binding.slot) ?? "",
    origin: bindingOrigin(binding.ref, binding.value),
    source: binding.ref ?? jsonText(binding.value),
    required: required.has(binding.slot),
  }))
}

const dynamicNames = (detail: ApiNodeDetail): ReadonlySet<string> =>
  new Set(detail.dynamic_slots.flatMap((slot) => slot.path.slice(-1)))

export const outputRows = (detail: ApiNodeDetail): readonly OutputRow[] => {
  const dynamic = dynamicNames(detail)
  const declared = declaredOutputs(detail.spec)
  if (declared.length > 0) {
    return declared.map((field) => ({
      name: field.name,
      typeLabel: field.type,
      description: field.description,
      dynamic: dynamic.has(field.name),
    }))
  }
  return schemaFields(detail.out_schema).map((field) => ({
    name: field.name,
    typeLabel: field.typeLabel,
    description: field.description,
    dynamic: dynamic.has(field.name),
  }))
}

const resolutionTone = (unbound: readonly BindingRow[]): Tone => {
  if (unbound.length === 0) return "success"
  return unbound.some((row) => row.required) ? "destructive" : "warning"
}

export const resolution = (rows: readonly BindingRow[]): Resolution => {
  const unbound = rows.filter((row) => row.origin === "unbound")
  return { bound: rows.length - unbound.length, total: rows.length, tone: resolutionTone(unbound) }
}

export const diagnosticLocation = (problem: ApiDiagnostic): string => {
  const line = problem.line
  if (line === null || line === undefined) return problem.file
  return `${problem.file}:${String(line)}`
}

const promptKey = (prompt: ApiPrompt): string => prompt.path ?? prompt.builder_ref ?? prompt.node_id

const promptLabel = (prompt: ApiPrompt): string => {
  if (prompt.path !== null) return fileStem(prompt.path)
  if (prompt.builder_ref !== null) return functionName(prompt.builder_ref)
  return prompt.node_id
}

export const promptGroups = (prompts: readonly ApiPrompt[]): readonly PromptGroup[] => {
  const groups = new Map<string, { readonly prompt: ApiPrompt; readonly nodeIds: string[] }>()
  prompts.forEach((prompt) => {
    const key = promptKey(prompt)
    const group = groups.get(key) ?? { prompt, nodeIds: [] }
    group.nodeIds.push(prompt.node_id)
    groups.set(key, group)
  })
  return [...groups].map(([key, group]) => ({
    key,
    label: promptLabel(group.prompt),
    level: group.prompt.level,
    nodeIds: group.nodeIds,
  }))
}
