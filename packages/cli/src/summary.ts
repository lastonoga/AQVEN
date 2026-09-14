import { isRecord } from "./ir-types.js"

export const SUMMARY_CHARS = 200
const HEAD_CHARS = 96
const MAX_FACTS = 3
const SHORT_VALUE = 28

const RU_PLURALS = new Intl.PluralRules("ru-RU")

const FORMS: Readonly<Record<string, readonly [string, string, string]>> = {
  элемент: ["элемент", "элемента", "элементов"],
  ветка: ["ветка", "ветки", "веток"],
  итерация: ["итерация", "итерации", "итераций"],
  знак: ["знак", "знака", "знаков"],
  поле: ["поле", "поля", "полей"],
  пункт: ["пункт", "пункта", "пунктов"],
}

const FORM_INDEX: Readonly<Record<string, number>> = { one: 0, few: 1, many: 2, other: 2 }

export const plural = (count: number, word: string): string => {
  const forms = FORMS[word]
  if (forms === undefined) return word
  return forms[FORM_INDEX[RU_PLURALS.select(count)] ?? 2] ?? word
}

const VERBS: Readonly<Record<string, string>> = {
  llm: "собрал",
  tool: "загрузил",
  code: "посчитал",
  human: "принял форму",
  call: "вызвал компонент",
  map: "обработал",
  switch: "выбрал",
  parallel: "свёл",
  loop: "прокрутил",
  gate: "дождался",
}

const DEFAULT_VERB = "выполнил"

const clip = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`

const lowerFirst = (text: string): string => (text === "" ? text : text[0]?.toLowerCase() + text.slice(1))

type Fact = { rank: number; text: string }

const listFact = (key: string, value: readonly unknown[]): Fact => ({
  rank: 0,
  text: `${value.length} ${key}`,
})

const numberFact = (key: string, value: number): Fact => ({ rank: 1, text: `${key} ${value}` })

const shortTextFact = (key: string, value: string): Fact => ({ rank: 2, text: `${key}: ${value}` })

const longTextFact = (key: string, value: string): Fact => ({
  rank: 3,
  text: `${key}: ${value.length} ${plural(value.length, "знак")}`,
})

const boolFact = (key: string, value: boolean): Fact => ({ rank: 4, text: value ? key : `без ${key}` })

const recordFact = (key: string, value: Record<string, unknown>): Fact => ({
  rank: 5,
  text: `${key}: ${Object.keys(value).length} ${plural(Object.keys(value).length, "поле")}`,
})

const factOf = (key: string, value: unknown): Fact | null => {
  if (Array.isArray(value)) return listFact(key, value)
  if (typeof value === "number") return numberFact(key, value)
  if (typeof value === "boolean") return boolFact(key, value)
  if (typeof value === "string") return value.length <= SHORT_VALUE ? shortTextFact(key, value) : longTextFact(key, value)
  if (isRecord(value)) return recordFact(key, value)
  return null
}

const recordFacts = (value: Record<string, unknown>): string[] =>
  Object.entries(value)
    .map(([key, item]) => factOf(key, item))
    .filter((fact): fact is Fact => fact !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_FACTS)
    .map((fact) => fact.text)

const itemNameOf = (outputType: string): string => (outputType.endsWith("[]") ? outputType.slice(0, -2) : "")

export const outputFacts = (output: unknown, outputType: string): string[] => {
  if (Array.isArray(output)) {
    const item = itemNameOf(outputType)
    const head = `${output.length} ${plural(output.length, "элемент")}`
    return [item === "" ? head : `${head} типа ${item}`]
  }
  if (isRecord(output)) return recordFacts(output)
  if (typeof output === "string") return [`${output.length} ${plural(output.length, "знак")}`]
  if (output === null || output === undefined) return ["пусто"]
  return [String(output)]
}

export type SummaryRequest = {
  nodeId: string
  kind: string
  description: string | null
  output: unknown
  outputType: string
  undeclared: boolean
  facts: readonly string[]
}

const HEAD_SPLIT = 52

const shortHead = (description: string): string => {
  const cut = description.indexOf(":")
  if (cut <= 0 || cut > HEAD_SPLIT) return clip(description, HEAD_CHARS)
  return description.slice(0, cut)
}

const headOf = (request: SummaryRequest): string => {
  const description = request.description ?? ""
  if (description === "") return request.nodeId
  return lowerFirst(shortHead(description))
}

const factsOf = (request: SummaryRequest): string[] => {
  if (request.facts.length > 0) return [...request.facts]
  if (request.undeclared) return [`тип выхода «${request.outputType}» в IR не объявлен`]
  return outputFacts(request.output, request.outputType)
}

export function summaryOf(request: SummaryRequest): string {
  const verb = VERBS[request.kind] ?? DEFAULT_VERB
  const facts = factsOf(request).join(", ")
  const head = headOf(request)
  const line = facts === "" ? `${verb} ${head}` : `${verb} ${head} · ${facts}`
  return clip(line, SUMMARY_CHARS)
}
