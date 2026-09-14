import { isBlank, isRecord, recordOf } from "./guards.js"
import { flatten } from "./text.js"
import type { Ir, IrType, IrTypeKind } from "../api/types.js"

export type SchemaNode = Readonly<Record<string, unknown>>

export type TypeView = {
  readonly name: string
  readonly kind: IrTypeKind | ""
  readonly label: string
  readonly head: string
  readonly description: string
  readonly schema: SchemaNode | null
  readonly required: readonly string[]
  readonly values: Readonly<Record<string, string>>
  readonly source: string
  readonly example: unknown
}

const LABEL_CHARS = 22
const LIST_PREFIX = /^спис(?:ок|ка)\s*:?\s*/i
const HEAD_STOP = /[,;:—(.]/
const ARRAY_SUFFIX = "[]"
const TAIL_WORDS = new Set([
  "в",
  "во",
  "для",
  "до",
  "за",
  "и",
  "из",
  "или",
  "к",
  "на",
  "о",
  "об",
  "от",
  "по",
  "при",
  "с",
  "со",
  "у",
  "через",
])

export const NO_TYPE: TypeView = {
  name: "",
  kind: "",
  label: "",
  head: "",
  description: "",
  schema: null,
  required: [],
  values: {},
  source: "",
  example: undefined,
}

const lowerFirst = (text: string): string => `${(text[0] ?? "").toLowerCase()}${text.slice(1)}`

const withinBudget = (taken: readonly string[]): boolean => taken.join(" ").length < LABEL_CHARS

const clauseOf = (text: string): string => {
  const stop = text.search(HEAD_STOP)
  return stop < 0 ? text : text.slice(0, stop)
}

const trimTail = (words: readonly string[]): readonly string[] => {
  const last = words[words.length - 1]
  if (last === undefined || words.length < 2) return words
  return TAIL_WORDS.has(last.toLowerCase()) ? trimTail(words.slice(0, -1)) : words
}

export const labelOfDescription = (description: string): string => {
  const flat = clauseOf(flatten(description).replace(LIST_PREFIX, ""))
  const words = flat.split(" ").filter((word) => word !== "")
  const taken = words.reduce<string[]>((acc, word) => (withinBudget(acc) ? [...acc, word] : acc), [])
  return lowerFirst(trimTail(taken).join(" "))
}

const headOf = (label: string): string => label.split(" ")[0] ?? ""

const nodeOf = (value: unknown): SchemaNode | null => (isRecord(value) ? value : null)

const textOf = (value: unknown): string => (typeof value === "string" ? value : "")

const listOfStrings = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

const stringMap = (value: unknown): Readonly<Record<string, string>> => {
  if (!isRecord(value)) return {}
  const pairs = Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === "string")
  return Object.fromEntries(pairs)
}

const exampleOf = (node: SchemaNode | null): unknown => {
  const examples = node?.["examples"]
  return Array.isArray(examples) ? examples[0] : undefined
}

const kindOfSchema = (node: SchemaNode | null): IrTypeKind | "" => {
  if (node === null) return ""
  if (Array.isArray(node["enum"])) return "enum"
  const type = textOf(node["type"])
  if (type === "array") return "array"
  if (type === "object") return "object"
  return type === "" ? "" : "scalar"
}

const viewOf = (name: string, node: SchemaNode | null, description: string): TypeView => {
  const label = labelOfDescription(description)
  return {
    name,
    kind: kindOfSchema(node),
    label,
    head: headOf(label),
    description,
    schema: node,
    required: listOfStrings(node?.["required"]),
    values: {},
    source: "",
    example: exampleOf(node),
  }
}

const declaredKind = (entry: IrType, node: SchemaNode | null): IrTypeKind | "" => {
  const declared = textOf(entry.kind)
  if (declared === "" || declared === "unknown") return kindOfSchema(node)
  return entry.kind
}

const viewOfEntry = (name: string, entry: IrType): TypeView => {
  const node = nodeOf(entry.schema)
  const described = textOf(entry.description) === "" ? textOf(node?.["description"]) : textOf(entry.description)
  const base = viewOf(name, node, described)
  return {
    ...base,
    kind: declaredKind(entry, node),
    values: stringMap(entry.valueDescriptions),
    source: textOf(entry.source),
    example: entry.example === undefined ? base.example : entry.example,
  }
}

export const typeViewOf = (ir: Ir | null, typeName: string): TypeView => {
  if (typeName === "") return NO_TYPE
  const entry = ir?.types?.[typeName]
  if (entry === undefined) return { ...NO_TYPE, name: typeName }
  return viewOfEntry(typeName, entry)
}

const itemNameOf = (name: string): string =>
  name.endsWith(ARRAY_SUFFIX) ? name.slice(0, name.length - ARRAY_SUFFIX.length) : name

export const itemViewOf = (ir: Ir | null, view: TypeView): TypeView => {
  if (view.name === "") return NO_TYPE
  const itemName = itemNameOf(view.name)
  const registered = typeViewOf(ir, itemName)
  if (registered.description !== "") return registered
  const items = nodeOf(view.schema?.["items"])
  if (items !== null) return viewOf(itemName, items, textOf(items["description"]))
  if (itemName === view.name) return NO_TYPE
  return { ...registered, label: view.label, head: view.head }
}

export const missingRequired = (value: unknown, view: TypeView): readonly string[] => {
  if (view.required.length === 0 || !isRecord(value)) return []
  const bag = recordOf(value)
  return view.required.filter((name) => isBlank(bag[name]))
}

export const valueDescriptionOf = (view: TypeView, value: unknown): string =>
  typeof value === "string" ? (view.values[value] ?? "") : ""
