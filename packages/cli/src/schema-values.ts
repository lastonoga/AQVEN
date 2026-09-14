import { mimeOfName } from "./media.js"
import { hex6, pickFrom, round2, unit } from "./random.js"
import { asSchema, isRecord, listAt, numberAt, stringsAt, textAt } from "./ir-types.js"
import type { MediaEnvelope } from "./media.js"
import type { JsonSchema, TypeCatalog } from "./ir-types.js"

export const LIST_ITEMS = 3
export const MAX_DEPTH = 7
export const MAX_TEXT = 180

const SANE_BOUND = 1_000_000

const ANCHOR_MS = Date.UTC(2026, 2, 16, 9, 0, 0)
const DAY_MS = 86_400_000

export type Emit = (mime: string, label: string) => MediaEnvelope

export type ValueContext = {
  catalog: TypeCatalog
  emit: Emit
  typeName: string
  key: string
  seed: string
  index: number
  depth: number
}

type Build = (schema: JsonSchema, ctx: ValueContext) => unknown

type Rule = { match: (schema: JsonSchema, ctx: ValueContext) => boolean; build: Build }

const NOUNS = ["вариант", "черновик", "подборка", "сводка", "предложение", "разбор", "заметка", "набор"]
const ADJECTIVES = ["короткий", "точный", "спорный", "проверенный", "черновой", "сильный", "нейтральный"]
const TAILS = ["по заявке", "по трём отелям", "по фильтрам", "для менеджера", "для клиента", "без правок"]

const ID_KEY = /(^|[._])id$|Id$/

const slug = (name: string): string =>
  name
    .replace(/\[\]$/, "")
    .replace(/<.*>$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

const clip = (text: string): string => (text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`)

const sentenceAt = (seed: string): string =>
  `${pickFrom(ADJECTIVES, `${seed}|a`, "черновой")} ${pickFrom(NOUNS, `${seed}|n`, "вариант")} ${pickFrom(TAILS, `${seed}|t`, "по заявке")}`

const clone = (value: unknown): unknown => (value === undefined ? null : structuredClone(value))

export const variantOf = (value: unknown, index: number): unknown => {
  if (index === 0) return value
  if (Array.isArray(value)) return value.map((item) => variantOf(item, index))
  if (!isRecord(value)) return value
  const entries = Object.entries(value).map(([key, item]) =>
    typeof item === "string" && ID_KEY.test(key) ? [key, `${item}-${index + 1}`] : [key, variantOf(item, index)],
  )
  return Object.fromEntries(entries)
}

const mediaMimeOf = (schema: JsonSchema, ctx: ValueContext): string => {
  const declared = textAt(schema, "contentMediaType")
  if (declared !== "") return declared
  if (ctx.key === "") return ""
  return mimeOfName(ctx.key)
}

const dayOffset = (seed: string): number => Math.floor(unit(seed) * 90) - 45

const isoAt = (ctx: ValueContext): string => new Date(ANCHOR_MS + dayOffset(ctx.seed) * DAY_MS).toISOString()

const dayAt = (ctx: ValueContext): string => isoAt(ctx).slice(0, 10)

const uriAt = (ctx: ValueContext): string => `https://example.org/${slug(ctx.typeName)}/${hex6(ctx.seed)}`

const emailAt = (ctx: ValueContext): string => `${slug(ctx.key) || "user"}.${hex6(ctx.seed)}@example.org`

const FORMATS: Readonly<Record<string, (ctx: ValueContext) => string>> = {
  "date-time": isoAt,
  date: dayAt,
  uri: uriAt,
  url: uriAt,
  email: emailAt,
}

const idText = (ctx: ValueContext): string => `${slug(ctx.key) || slug(ctx.typeName) || "item"}-${hex6(ctx.seed)}`

const STRING_KEYS: readonly { match: RegExp; text: (ctx: ValueContext) => string }[] = [
  { match: ID_KEY, text: idText },
  { match: /^(slug|code|sku|key)$/i, text: (ctx) => `${slug(ctx.key)}-${hex6(ctx.seed)}` },
  { match: /(locale|lang)/i, text: () => "ru-RU" },
  { match: /(currency)/i, text: () => "RUB" },
  { match: /(^|_)(at|on)$|_at$|Date$|date$/i, text: isoAt },
]

const describedText = (schema: JsonSchema, ctx: ValueContext): string => {
  const description = textAt(schema, "description")
  if (description !== "") return clip(description)
  return sentenceAt(ctx.seed)
}

const stringValue: Build = (schema, ctx) => {
  const format = FORMATS[textAt(schema, "format")]
  if (format !== undefined) return format(ctx)
  const keyed = STRING_KEYS.find((rule) => rule.match.test(ctx.key))
  if (keyed !== undefined) return keyed.text(ctx)
  return describedText(schema, ctx)
}

const NUMBER_KEYS: readonly { match: RegExp; value: (ctx: ValueContext) => number }[] = [
  { match: /(score|rating|confidence|share|threshold|probability|ratio|avg)/i, value: (ctx) => round2(unit(ctx.seed)) },
  { match: /(minor|amount|price|cost|sum|budget|micros)/i, value: (ctx) => Math.round(unit(ctx.seed) * 900 + 100) * 100 },
  { match: /(count|index|total|size|length|nights|days|hours|stars|votes|iter|attempts|top)/i, value: (ctx) => 1 + Math.floor(unit(ctx.seed) * 9) },
]

const boundedNumber = (schema: JsonSchema, ctx: ValueContext): number => {
  const low = numberAt(schema, "minimum")
  const high = numberAt(schema, "maximum")
  const from = low !== null && Math.abs(low) < SANE_BOUND ? low : 1
  const to = high !== null && Math.abs(high) < SANE_BOUND ? high : from + 99
  return from + unit(ctx.seed) * Math.max(to - from, 0)
}

const numberValue: Build = (schema, ctx) => {
  const keyed = NUMBER_KEYS.find((rule) => rule.match.test(ctx.key))
  if (keyed !== undefined) return keyed.value(ctx)
  return round2(boundedNumber(schema, ctx))
}

const integerValue: Build = (schema, ctx) => Math.round(Number(numberValue(schema, ctx)))

const booleanValue: Build = (_schema, ctx) => unit(ctx.seed) > 0.4

const child = (ctx: ValueContext, key: string, index: number): ValueContext => ({
  ...ctx,
  key,
  index,
  seed: index === 0 ? `${ctx.seed}.${key}` : `${ctx.seed}.${key}[${index}]`,
  depth: ctx.depth + 1,
})

const orderedKeys = (schema: JsonSchema, properties: Record<string, unknown>): string[] => {
  const required = stringsAt(schema, "required").filter((key) => key in properties)
  const rest = Object.keys(properties).filter((key) => !required.includes(key))
  return [...required, ...rest]
}

const objectValue: Build = (schema, ctx) => {
  const properties = isRecord(schema["properties"]) ? schema["properties"] : {}
  const keys = orderedKeys(schema, properties)
  return Object.fromEntries(
    keys.map((key) => [key, valueOfSchema(asSchema(properties[key]), child(ctx, key, 0))]),
  )
}

const itemCount = (schema: JsonSchema): number => {
  const min = numberAt(schema, "minItems")
  if (min === null) return LIST_ITEMS
  return Math.min(Math.max(Math.round(min), 1), LIST_ITEMS)
}

const arrayValue: Build = (schema, ctx) => {
  const items = asSchema(schema["items"])
  const count = itemCount(schema)
  return Array.from({ length: count }, (_unused, index) =>
    valueOfSchema(items, { ...ctx, seed: `${ctx.seed}[${index}]`, index, depth: ctx.depth + 1 }),
  )
}

const BY_TYPE: Readonly<Record<string, Build>> = {
  object: objectValue,
  array: arrayValue,
  string: stringValue,
  integer: integerValue,
  number: numberValue,
  boolean: booleanValue,
  null: () => null,
}

const typedValue: Build = (schema, ctx) => {
  const build = BY_TYPE[textAt(schema, "type")]
  if (build !== undefined) return build(schema, ctx)
  if (isRecord(schema["properties"])) return objectValue(schema, ctx)
  return describedText(schema, ctx)
}

const enumValue: Build = (schema, ctx) => {
  const values = listAt(schema, "enum")
  return values[Math.floor(unit(ctx.seed) * values.length)] ?? null
}

const branchesOf = (schema: JsonSchema): JsonSchema[] =>
  [...listAt(schema, "anyOf"), ...listAt(schema, "oneOf")].map(asSchema)

const anyOfValue: Build = (schema, ctx) => {
  const usable = branchesOf(schema).filter((branch) => textAt(branch, "type") !== "null")
  const first = usable[0]
  if (first === undefined) return null
  return valueOfSchema(first, ctx)
}

const exampleValue: Build = (schema, ctx) => variantOf(clone(listAt(schema, "examples")[0]), ctx.index)

const mediaValue: Build = (schema, ctx) => ctx.emit(mediaMimeOf(schema, ctx), ctx.key === "" ? ctx.typeName : ctx.key)

const RULES: readonly Rule[] = [
  { match: (schema, ctx) => mediaMimeOf(schema, ctx) !== "", build: mediaValue },
  { match: (schema) => "const" in schema, build: (schema) => clone(schema["const"]) },
  { match: (schema) => listAt(schema, "examples").length > 0, build: exampleValue },
  { match: (schema) => schema["default"] !== undefined, build: (schema) => clone(schema["default"]) },
  { match: (schema) => listAt(schema, "enum").length > 0, build: enumValue },
  { match: (schema) => branchesOf(schema).length > 0, build: anyOfValue },
]

export function valueOfSchema(schema: JsonSchema, ctx: ValueContext): unknown {
  if (ctx.depth > MAX_DEPTH) return null
  const rule = RULES.find((candidate) => candidate.match(schema, ctx))
  if (rule !== undefined) return rule.build(schema, ctx)
  return typedValue(schema, ctx)
}
