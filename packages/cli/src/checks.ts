import { asSchema, factsOf, isRecord, stringsAt, textAt } from "./ir-types.js"
import type { JsonSchema, TypeCatalog } from "./ir-types.js"
import type { TypeSource } from "./type-values.js"

export type Check = { name: string; ok: boolean; message: string }

export type ChecksRequest = {
  typeName: string
  catalog: TypeCatalog
  source: TypeSource
  output: unknown
  requiredPaths: readonly string[][]
  usdMicros: number
  budgetMicros: number | null
}

type Rule = (request: ChecksRequest) => Check | null

const MAX_LISTED = 6

const at = (value: unknown, segment: string): unknown => {
  if (segment === "*") return Array.isArray(value) ? value : undefined
  if (Array.isArray(value)) return value.map((item) => at(item, segment)).find((item) => item !== undefined)
  if (!isRecord(value)) return undefined
  return value[segment]
}

const resolvePath = (value: unknown, path: readonly string[]): unknown => path.reduce(at, value)

const isFilled = (value: unknown): boolean => value !== undefined && value !== null

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "string") return value.trim() === ""
  if (isRecord(value)) return Object.keys(value).length === 0
  return false
}

const listed = (names: readonly string[]): string => {
  const head = names.slice(0, MAX_LISTED).join(", ")
  return names.length <= MAX_LISTED ? head : `${head} и ещё ${names.length - MAX_LISTED}`
}

const schemaCheck: Rule = (request) => {
  const facts = factsOf(request.catalog, request.typeName)
  if (facts === undefined)
    return { name: "схема типа", ok: false, message: `тип «${request.typeName}» в IR не объявлен, сверять не с чем` }
  if (request.source === "example")
    return { name: "схема типа", ok: true, message: `значение взято из примера типа «${request.typeName}» в IR` }
  if (facts.schema !== undefined)
    return { name: "схема типа", ok: true, message: `значение собрано по схеме типа «${request.typeName}»` }
  return { name: "схема типа", ok: false, message: `у типа «${request.typeName}» нет схемы в IR` }
}

const missingIn = (value: unknown, required: readonly string[]): string[] => {
  if (!isRecord(value)) return [...required]
  return required.filter((key) => !isFilled(value[key]))
}

const itemsCheck = (request: ChecksRequest, schema: JsonSchema): Check | null => {
  const items = asSchema(schema["items"])
  const required = stringsAt(items, "required")
  if (required.length === 0) return null
  const output = request.output
  if (!Array.isArray(output)) return { name: "обязательные поля", ok: false, message: "выход не список" }
  const broken = output.filter((item) => missingIn(item, required).length > 0)
  if (broken.length === 0)
    return { name: "обязательные поля", ok: true, message: `во всех ${output.length} элементах заполнены ${required.length}` }
  return { name: "обязательные поля", ok: false, message: `${broken.length} элементов без обязательных полей: ${listed(required)}` }
}

const requiredCheck: Rule = (request) => {
  const schema = asSchema(factsOf(request.catalog, request.typeName)?.schema)
  if (textAt(schema, "type") === "array") return itemsCheck(request, schema)
  const required = stringsAt(schema, "required")
  if (required.length === 0) return null
  const output = request.output
  if (!isRecord(output))
    return { name: "обязательные поля", ok: false, message: `выход не запись, а ${typeof output}` }
  const missing = required.filter((key) => !isFilled(output[key]))
  if (missing.length === 0)
    return { name: "обязательные поля", ok: true, message: `все ${required.length} заполнены` }
  return { name: "обязательные поля", ok: false, message: `не заполнены: ${listed(missing)}` }
}

const emptyCheck: Rule = (request) => ({
  name: "непустой результат",
  ok: !isEmpty(request.output),
  message: isEmpty(request.output) ? "выход пуст" : "выход не пуст",
})

const consumersCheck: Rule = (request) => {
  if (request.requiredPaths.length === 0) return null
  const paths = request.requiredPaths.map((path) => path.join("."))
  const missing = request.requiredPaths
    .filter((path) => !isFilled(resolvePath(request.output, path)))
    .map((path) => path.join("."))
  if (missing.length === 0)
    return { name: "ссылки других узлов", ok: true, message: `найдены все пути: ${listed(paths)}` }
  return { name: "ссылки других узлов", ok: false, message: `нет путей: ${listed(missing)}` }
}

const budgetCheck: Rule = (request) => {
  if (request.budgetMicros === null) return null
  const ok = request.usdMicros <= request.budgetMicros
  return {
    name: "бюджет узла",
    ok,
    message: `оценка ${request.usdMicros} из ${request.budgetMicros} usdMicros`,
  }
}

const RULES: readonly Rule[] = [schemaCheck, requiredCheck, emptyCheck, consumersCheck, budgetCheck]

export const checksOf = (request: ChecksRequest): Check[] =>
  RULES.map((rule) => rule(request)).filter((check): check is Check => check !== null)
