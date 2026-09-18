import type { ApiFlowSchemas, ApiJsonValue, ApiRunStartRequest } from "@/domain"
import type { ApiProblem } from "@/api/client"

export type RunContextKey = ApiFlowSchemas["context"][number]

export type RunContextBody = NonNullable<ApiRunStartRequest["context"]>

export type InputControl = "text" | "area" | "number" | "boolean" | "enum" | "json"

export type FieldValue = string | boolean

export type InputField = {
  readonly name: string
  readonly control: InputControl
  readonly options: readonly string[]
  readonly required: boolean
  readonly nullable: boolean
  readonly initial: FieldValue
}

export type InputDraft = ReadonlyMap<string, FieldValue>

export type ContextDraft = ReadonlyMap<RunContextKey, string>

export type InputResult = { readonly ok: true; readonly value: ApiJsonValue } | { readonly ok: false; readonly invalid: readonly string[] }

type SchemaNode = Readonly<Record<string, unknown>>

const MULTILINE_ABOVE = 200
const DATE_PAD = 2
const EMPTY_OBJECT = "{}"
const EMPTY_LIST = "[]"
const NULL_TEXT = "null"
const PROBLEM_SEPARATOR = " · "

const isRecord = (value: unknown): value is SchemaNode => typeof value === "object" && value !== null && !Array.isArray(value)

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const textAt = (node: SchemaNode, key: string): string | null => {
  const value = node[key]
  return typeof value === "string" ? value : null
}

const numberAt = (node: SchemaNode, key: string): number | null => {
  const value = node[key]
  return typeof value === "number" ? value : null
}

const textList = (value: unknown): readonly string[] => (isList(value) ? value.filter((item): item is string => typeof item === "string") : [])

const variants = (node: SchemaNode): readonly SchemaNode[] => {
  const rows = [node["anyOf"], node["oneOf"]].flatMap((value) => (isList(value) ? value.filter(isRecord) : []))
  return rows.length === 0 ? [node] : rows
}

const isNullBranch = (node: SchemaNode): boolean => node["type"] === NULL_TEXT

const baseOf = (node: SchemaNode): SchemaNode => variants(node).find((branch) => !isNullBranch(branch)) ?? node

const isNullable = (node: SchemaNode): boolean => variants(node).some(isNullBranch)

const textControl = (node: SchemaNode): InputControl => ((numberAt(node, "maxLength") ?? Number.POSITIVE_INFINITY) > MULTILINE_ABOVE ? "area" : "text")

const CONTROL_BY_TYPE: Readonly<Record<string, (node: SchemaNode) => InputControl>> = {
  string: textControl,
  boolean: () => "boolean",
  integer: () => "number",
  number: () => "number",
}

const controlOf = (base: SchemaNode, options: readonly string[]): InputControl => {
  if (options.length > 0) return "enum"
  const build = CONTROL_BY_TYPE[textAt(base, "type") ?? ""]
  return build === undefined ? "json" : build(base)
}

const jsonInitial = (base: SchemaNode, nullable: boolean): string => {
  if (nullable) return NULL_TEXT
  return base["type"] === "array" ? EMPTY_LIST : EMPTY_OBJECT
}

const INITIAL_BY_CONTROL: Readonly<Record<InputControl, (base: SchemaNode, options: readonly string[], nullable: boolean) => FieldValue>> = {
  text: () => "",
  area: () => "",
  number: () => "",
  boolean: () => false,
  enum: (_base, options) => options[0] ?? "",
  json: (base, _options, nullable) => jsonInitial(base, nullable),
}

const fieldOf = (name: string, node: unknown, required: readonly string[]): readonly InputField[] => {
  if (!isRecord(node)) return []
  const base = baseOf(node)
  const options = textList(base["enum"])
  const control = controlOf(base, options)
  const nullable = isNullable(node)
  return [{ name, control, options, required: required.includes(name), nullable, initial: INITIAL_BY_CONTROL[control](base, options, nullable) }]
}

export const inputFields = (schema: ApiJsonValue): readonly InputField[] => {
  if (!isRecord(schema)) return []
  const properties = schema["properties"]
  if (!isRecord(properties)) return []
  const required = textList(schema["required"])
  return Object.entries(properties).flatMap(([name, node]) => fieldOf(name, node, required))
}

export const emptyInput = (fields: readonly InputField[]): InputDraft => new Map(fields.map((field) => [field.name, field.initial]))

const asText = (raw: FieldValue | undefined): string => (typeof raw === "string" ? raw : "")

const textResult = (field: InputField, raw: FieldValue | undefined): InputResult => {
  const value = asText(raw)
  return { ok: true, value: value.length === 0 && field.nullable ? null : value }
}

const numberResult = (field: InputField, raw: FieldValue | undefined): InputResult => {
  const value = asText(raw).trim()
  if (value.length === 0) return { ok: true, value: null }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false, invalid: [field.name] }
}

const jsonResult = (field: InputField, raw: FieldValue | undefined): InputResult => {
  const value = asText(raw).trim()
  if (value.length === 0) return { ok: true, value: null }
  try {
    const parsed: unknown = JSON.parse(value)
    return { ok: true, value: parsed }
  } catch {
    return { ok: false, invalid: [field.name] }
  }
}

const READ_BY_CONTROL: Readonly<Record<InputControl, (field: InputField, raw: FieldValue | undefined) => InputResult>> = {
  text: textResult,
  area: textResult,
  number: numberResult,
  boolean: (_field, raw) => ({ ok: true, value: raw === true }),
  enum: (_field, raw) => ({ ok: true, value: asText(raw) }),
  json: jsonResult,
}

export const readInput = (fields: readonly InputField[], draft: InputDraft): InputResult => {
  const read = fields.map((field) => ({ field, result: READ_BY_CONTROL[field.control](field, draft.get(field.name)) }))
  const invalid = read.flatMap(({ result }) => (result.ok ? [] : result.invalid))
  if (invalid.length > 0) return { ok: false, invalid }
  const entries = read.flatMap(({ field, result }) => (result.ok ? [[field.name, result.value] as const] : []))
  return { ok: true, value: Object.fromEntries(entries) }
}

const pad = (value: number): string => String(value).padStart(DATE_PAD, "0")

export const isoDate = (now: Date): string => `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

export const emptyContext = (keys: readonly RunContextKey[], today: string): ContextDraft =>
  new Map(keys.map((key) => [key, key === "date" ? today : ""]))

const contextValue = (keys: readonly RunContextKey[], draft: ContextDraft, key: RunContextKey): string | null => {
  if (!keys.includes(key)) return null
  const value = (draft.get(key) ?? "").trim()
  return value.length === 0 ? null : value
}

export const runContext = (keys: readonly RunContextKey[], draft: ContextDraft): RunContextBody => ({
  date: contextValue(keys, draft, "date"),
  time_zone: contextValue(keys, draft, "time_zone"),
  locale: contextValue(keys, draft, "locale"),
  tenant_id: contextValue(keys, draft, "tenant_id"),
})

export type ProblemRoot = "context" | "input"

const fieldName = (problem: ApiProblem): string => String(problem.path[1] ?? "")

const rootedAt = (problems: readonly ApiProblem[], root: ProblemRoot): readonly ApiProblem[] =>
  problems.filter((problem) => problem.path[0] === root && problem.path.length > 1)

const problemText = (problem: ApiProblem): string => {
  const deeper = problem.path.slice(2).map(String).join(".")
  return deeper.length === 0 ? problem.message : `${deeper}: ${problem.message}`
}

export const fieldProblems = (problems: readonly ApiProblem[], root: ProblemRoot): ReadonlyMap<string, string> => {
  const rows = rootedAt(problems, root)
  const names = [...new Set(rows.map(fieldName))]
  return new Map(names.map((name) => [name, rows.filter((row) => fieldName(row) === name).map(problemText).join(PROBLEM_SEPARATOR)]))
}

export const unshownProblems = (problems: readonly ApiProblem[], shown: readonly string[]): readonly ApiProblem[] =>
  problems.filter((problem) => !shown.includes(`${String(problem.path[0] ?? "")}.${fieldName(problem)}`))
