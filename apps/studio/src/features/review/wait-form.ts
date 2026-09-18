import type { ApiJsonObject, ApiJsonValue } from "@/domain"

export type FieldValue = string | number | boolean | null

export type FormControl =
  | { readonly control: "boolean" }
  | { readonly control: "enum"; readonly options: readonly string[] }
  | { readonly control: "text"; readonly multiline: boolean; readonly maxLength: number | null }
  | { readonly control: "number" }
  | { readonly control: "json" }

export type ControlKind = FormControl["control"]

type FieldMeta = {
  readonly name: string
  readonly label: string
  readonly required: boolean
  readonly nullable: boolean
}

export type FormField = { [K in ControlKind]: Extract<FormControl, { readonly control: K }> & FieldMeta }[ControlKind]

export type FieldOf<K extends ControlKind> = Extract<FormField, { readonly control: K }>

export type WaitForm = { readonly kind: "fields"; readonly fields: readonly FormField[] } | { readonly kind: "raw" }

export type AnswerDraft = ReadonlyMap<string, FieldValue>

export type PayloadResult =
  | { readonly ok: true; readonly payload: ApiJsonValue }
  | { readonly ok: false; readonly invalid: readonly string[] }

export const RAW_FIELD = "payload"

const MULTILINE_ABOVE = 200
const EMPTY_OBJECT = "{}"

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value)

const recordAt = (node: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> | null => {
  const value = node[key]
  return isRecord(value) ? value : null
}

const numberAt = (node: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = node[key]
  return typeof value === "number" ? value : null
}

const textAt = (node: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = node[key]
  return typeof value === "string" ? value : null
}

const textList = (value: unknown): readonly string[] => (isList(value) ? value.filter((item): item is string => typeof item === "string") : [])

const branches = (node: Readonly<Record<string, unknown>>): readonly Readonly<Record<string, unknown>>[] => {
  const anyOf = node["anyOf"]
  if (!isList(anyOf)) return [node]
  const rows = anyOf.filter(isRecord)
  return rows.length === 0 ? [node] : rows
}

const isNullBranch = (node: Readonly<Record<string, unknown>>): boolean => node["type"] === "null"

const baseOf = (node: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  branches(node).find((branch) => !isNullBranch(branch)) ?? node

const isNullable = (node: Readonly<Record<string, unknown>>): boolean => branches(node).some(isNullBranch)

const textControl = (node: Readonly<Record<string, unknown>>): FormControl => {
  const maxLength = numberAt(node, "maxLength")
  return { control: "text", multiline: maxLength === null || maxLength > MULTILINE_ABOVE, maxLength }
}

const CONTROL_BY_TYPE: Readonly<Record<string, (node: Readonly<Record<string, unknown>>) => FormControl>> = {
  boolean: () => ({ control: "boolean" }),
  string: textControl,
  integer: () => ({ control: "number" }),
  number: () => ({ control: "number" }),
}

const controlOf = (node: Readonly<Record<string, unknown>>): FormControl => {
  const base = baseOf(node)
  const options = textList(base["enum"])
  if (options.length > 0) return { control: "enum", options }
  const build = CONTROL_BY_TYPE[textAt(base, "type") ?? ""]
  return build === undefined ? { control: "json" } : build(base)
}

const fieldOf = (name: string, node: unknown, required: readonly string[]): readonly FormField[] => {
  if (!isRecord(node)) return []
  return [
    {
      ...controlOf(node),
      name,
      label: textAt(baseOf(node), "title") ?? textAt(node, "title") ?? name,
      required: required.includes(name),
      nullable: isNullable(node),
    },
  ]
}

export const readWaitForm = (schema: ApiJsonObject | null): WaitForm => {
  if (schema === null) return { kind: "raw" }
  const properties = recordAt(schema, "properties")
  if (properties === null) return { kind: "raw" }
  const required = textList(schema["required"])
  const fields = Object.entries(properties).flatMap(([name, node]) => fieldOf(name, node, required))
  return fields.length === 0 ? { kind: "raw" } : { kind: "fields", fields }
}

const DEFAULT_VALUE: { readonly [K in ControlKind]: (field: FieldOf<K>) => FieldValue } = {
  boolean: () => false,
  enum: (field) => field.options[0] ?? "",
  text: () => "",
  number: () => "",
  json: () => EMPTY_OBJECT,
}

const defaultValue = <K extends ControlKind>(field: FieldOf<K>): FieldValue => {
  const read: (field: FieldOf<K>) => FieldValue = DEFAULT_VALUE[field.control]
  return read(field)
}

export const emptyDraft = (form: WaitForm): AnswerDraft => {
  if (form.kind === "raw") return new Map([[RAW_FIELD, EMPTY_OBJECT]])
  return new Map(form.fields.map((field) => [field.name, defaultValue(field)]))
}

const parseJson = (text: string): PayloadResult => {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: true, payload: null }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return { ok: true, payload: parsed }
  } catch {
    return { ok: false, invalid: [] }
  }
}

const textValue = (field: FormField, raw: FieldValue | undefined): ApiJsonValue => {
  const text = typeof raw === "string" ? raw : ""
  if (text.length > 0) return text
  return field.nullable ? null : text
}

const numberValue = (raw: FieldValue | undefined): ApiJsonValue => {
  const text = typeof raw === "string" ? raw.trim() : String(raw ?? "")
  if (text.length === 0) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : text
}

const READ_VALUE: { readonly [K in ControlKind]: (field: FieldOf<K>, raw: FieldValue | undefined) => PayloadResult } = {
  boolean: (_field, raw) => ({ ok: true, payload: raw === true }),
  enum: (_field, raw) => ({ ok: true, payload: typeof raw === "string" ? raw : null }),
  text: (field, raw) => ({ ok: true, payload: textValue(field, raw) }),
  number: (_field, raw) => ({ ok: true, payload: numberValue(raw) }),
  json: (_field, raw) => parseJson(typeof raw === "string" ? raw : ""),
}

const readValue = <K extends ControlKind>(field: FieldOf<K>, raw: FieldValue | undefined): PayloadResult => {
  const read: (field: FieldOf<K>, raw: FieldValue | undefined) => PayloadResult = READ_VALUE[field.control]
  return read(field, raw)
}

const fieldsPayload = (fields: readonly FormField[], draft: AnswerDraft): PayloadResult => {
  const read = fields.map((field) => ({ field, result: readValue(field, draft.get(field.name)) }))
  const invalid = read.flatMap(({ field, result }) => (result.ok ? [] : [field.name]))
  if (invalid.length > 0) return { ok: false, invalid }
  const entries = read.flatMap(({ field, result }) => (result.ok ? [[field.name, result.payload] as const] : []))
  return { ok: true, payload: Object.fromEntries(entries) }
}

export const readPayload = (form: WaitForm, draft: AnswerDraft): PayloadResult => {
  if (form.kind === "fields") return fieldsPayload(form.fields, draft)
  const result = parseJson(typeof draft.get(RAW_FIELD) === "string" ? String(draft.get(RAW_FIELD)) : "")
  return result.ok ? result : { ok: false, invalid: [RAW_FIELD] }
}
