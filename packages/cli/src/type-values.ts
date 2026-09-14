import { mimeOfType } from "./media.js"
import { round2, unit } from "./random.js"
import { asSchema, factsOf } from "./ir-types.js"
import { valueOfSchema, variantOf } from "./schema-values.js"
import type { TypeCatalog } from "./ir-types.js"
import type { Emit, ValueContext } from "./schema-values.js"

export const LIST_FALLBACK_ITEMS = 3

export type TypeSource = "example" | "schema" | "media" | "name" | "stub" | "none"

export type TypeValue = { value: unknown; source: TypeSource }

export type TypeRequest = {
  typeName: string
  catalog: TypeCatalog
  emit: Emit
  index: number
  fallbackText: string
}

type Named = { match: (name: string) => boolean; make: (seed: string) => unknown }

const NAME_RULES: readonly Named[] = [
  { match: (name) => /(text|string|message|comment|note|body)$/i.test(name), make: (seed) => `текст без объявленного типа (${seed})` },
  { match: (name) => /(decision|status|verdict)$/i.test(name), make: () => "accept" },
  { match: (name) => /(number|count|score|total)$/i.test(name), make: (seed) => round2(unit(seed) * 10) },
  { match: (name) => /(bool|boolean|flag)$/i.test(name), make: (seed) => unit(seed) > 0.4 },
]

const contextOf = (request: TypeRequest, seed: string): ValueContext => ({
  catalog: request.catalog,
  emit: request.emit,
  typeName: request.typeName,
  key: "",
  seed,
  index: request.index,
  depth: 0,
})

const seedOf = (request: TypeRequest): string => `${request.typeName}#${request.index}`

const undeclaredNote = (typeName: string): string =>
  `тип «${typeName}» не объявлен в IR: нет ни примера, ни схемы, показана подпись узла`

const fallbackValue = (request: TypeRequest): TypeValue => {
  const seed = seedOf(request)
  const named = NAME_RULES.find((rule) => rule.match(request.typeName))
  if (named !== undefined) return { value: named.make(seed), source: "name" }
  return { value: { text: request.fallbackText, note: undeclaredNote(request.typeName) }, source: "stub" }
}

const listValue = (request: TypeRequest): TypeValue | null => {
  if (!request.typeName.endsWith("[]")) return null
  const base = request.typeName.slice(0, -2)
  const items = Array.from({ length: LIST_FALLBACK_ITEMS }, (_unused, index) =>
    typeValue({ ...request, typeName: base, index }),
  )
  const first = items[0]
  return { value: items.map((item) => item.value), source: first?.source ?? "stub" }
}

const mediaValue = (request: TypeRequest): TypeValue | null => {
  const mime = mimeOfType(request.catalog, request.typeName)
  if (mime === "") return null
  return { value: request.emit(mime, request.typeName), source: "media" }
}

export function typeValue(request: TypeRequest): TypeValue {
  const media = mediaValue(request)
  if (media !== null) return media

  const facts = factsOf(request.catalog, request.typeName)
  if (facts?.example !== undefined)
    return { value: variantOf(structuredClone(facts.example), request.index), source: "example" }
  if (facts?.schema !== undefined)
    return { value: valueOfSchema(asSchema(facts.schema), contextOf(request, seedOf(request))), source: "schema" }

  const list = listValue(request)
  if (list !== null) return list

  return fallbackValue(request)
}

export const SOURCE_NOTES: Readonly<Record<TypeSource, (typeName: string) => string>> = {
  example: (typeName) => `значение взято из примера типа «${typeName}», объявленного в IR`,
  schema: (typeName) => `значение собрано по схеме типа «${typeName}»: поля, required и описания из IR`,
  media: (typeName) => `тип «${typeName}» медийный: сгенерирован файл-заглушка`,
  name: (typeName) => `тип «${typeName}» не объявлен: значение выведено по имени типа`,
  stub: undeclaredNote,
  none: (typeName) => `значение узла не строилось по типу «${typeName}»: взято из выходов других узлов`,
}
