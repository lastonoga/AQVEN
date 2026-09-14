import { formatBytes } from "../refs/index.js"
import { factsOf } from "./detect.js"
import { isBlank, isRecord, listOf, recordOf } from "./guards.js"
import { hintOf } from "./hint.js"
import { NO_TYPE, missingRequired, valueDescriptionOf } from "./ir-types.js"
import { extensionOfMime } from "./mime.js"
import { countedNoun, plural } from "./russian.js"
import {
  SUMMARY_CHARS,
  charsNote,
  clip,
  dateText,
  firstSentence,
  flatten,
  isDateText,
  joinFacts,
  linkText,
  numberText,
  quoted,
} from "./text.js"
import type { TypeView } from "./ir-types.js"
import type { MediaRef, Rendered, SummaryKind, ValueFacts, ValueKind } from "./kinds.js"

export { SUMMARY_CHARS, clip } from "./text.js"
export { plural } from "./russian.js"

export type SummaryContext = {
  readonly view: TypeView
  readonly item: TypeView
}

export const NO_CONTEXT: SummaryContext = { view: NO_TYPE, item: NO_TYPE }

export const EMPTY_TEXT = "— пусто"

const FIELD_LIMIT = 3
const SERVICE_PREFIX = "_"

export const KIND_LABELS: Readonly<Record<ValueKind, string>> = {
  empty: "пусто",
  text: "текст",
  number: "число",
  boolean: "булево",
  object: "объект",
  array: "массив",
  image: "изображение",
  video: "видео",
  audio: "аудио",
  file: "файл",
  link: "ссылка",
}

export const sizeLabel = (bytes: number): string => (bytes > 0 ? formatBytes(bytes) : "размер неизвестен")

export const formatLabel = (media: MediaRef): string => {
  const extension = extensionOfMime(media.mime)
  if (extension !== "") return extension.toUpperCase()
  return media.mime === "" ? "" : media.mime
}

export const mediaLabel = (media: MediaRef): string =>
  joinFacts([media.name, formatLabel(media), sizeLabel(media.bytes)])

const rendered = (text: string, detail = "", count = 0): Rendered => ({ text, detail, count })

const countLabel = (count: number, one: string, few: string, many: string): string =>
  `${numberText(count)} ${plural(count, one, few, many)}`

const fieldsCount = (count: number): string => countLabel(count, "поле", "поля", "полей")

const itemsCount = (count: number): string => countLabel(count, "элемент", "элемента", "элементов")

const mediaShort = (facts: ValueFacts): string => {
  if (facts.media === null) return KIND_LABELS[facts.kind]
  return facts.media.name === "" ? KIND_LABELS[facts.kind] : facts.media.name
}

const shortText = (facts: ValueFacts): string => {
  const raw = String(facts.value)
  return isDateText(raw) ? dateText(raw) : quoted(firstSentence(raw))
}

const SHORT: Readonly<Record<ValueKind, (facts: ValueFacts) => string>> = {
  empty: () => "—",
  text: shortText,
  number: (facts) => numberText(Number(facts.value)),
  boolean: (facts) => (facts.value === true ? "да" : "нет"),
  object: (facts) => fieldsCount(Object.keys(recordOf(facts.value)).length),
  array: (facts) => itemsCount(listOf(facts.value).length),
  image: mediaShort,
  video: mediaShort,
  audio: mediaShort,
  file: mediaShort,
  link: (facts) => linkText(facts.media?.src ?? String(facts.value)),
}

export const shortValue = (value: unknown): string => {
  const facts = factsOf(value)
  return SHORT[facts.kind](facts)
}

const isService = (name: string): boolean => name.startsWith(SERVICE_PREFIX)

const orderedFields = (bag: Readonly<Record<string, unknown>>, view: TypeView): readonly string[] => {
  const keys = Object.keys(bag)
  const known = view.required.filter((name) => keys.includes(name))
  const rest = keys.filter((name) => !known.includes(name) && !isService(name))
  const service = keys.filter((name) => isService(name))
  return [...known, ...rest, ...service]
}

const missingNote = (value: unknown, view: TypeView): string => {
  const missing = missingRequired(value, view)
  return missing.length === 0 ? "" : `не заполнено: ${missing.join(", ")}`
}

const objectDetail = (value: unknown, view: TypeView): string => {
  const note = missingNote(value, view)
  return note === "" ? view.label : note
}

type Summarizer = (facts: ValueFacts, ctx: SummaryContext) => Rendered

const emptyDetail = (facts: ValueFacts, ctx: SummaryContext): string => {
  if (Array.isArray(facts.value)) return joinFacts(["пустой список", ctx.item.label])
  if (isRecord(facts.value)) return joinFacts([missingNote(facts.value, ctx.view), "объект без заполненных полей"])
  if (facts.value === "") return joinFacts(["пустая строка", ctx.view.label])
  return joinFacts(["значения нет", ctx.view.label])
}

const emptySummary: Summarizer = (facts, ctx) => rendered(EMPTY_TEXT, emptyDetail(facts, ctx))

const textSummary: Summarizer = (facts, ctx) => {
  const flat = flatten(String(facts.value))
  const shown = clip(firstSentence(flat), SUMMARY_CHARS)
  const rest = flat.length - shown.length
  return rendered(shown, rest > 0 ? charsNote(rest) : ctx.view.label, flat.length)
}

const numberSummary: Summarizer = (facts, ctx) => rendered(numberText(Number(facts.value)), ctx.view.label)

const booleanSummary: Summarizer = (facts, ctx) =>
  rendered(facts.value === true ? "да" : "нет", ctx.view.label)

const objectSummary: Summarizer = (facts, ctx) => {
  const bag = recordOf(facts.value)
  const shown = orderedFields(bag, ctx.view)
    .filter((name) => !isBlank(bag[name]))
    .slice(0, FIELD_LIMIT)
  const text = joinFacts(shown.map((name) => `${name}: ${shortValue(bag[name])}`))
  return rendered(text, objectDetail(bag, ctx.view), Object.keys(bag).length)
}

const countedText = (count: number, item: TypeView): string => {
  const counted = countedNoun(count, item.head)
  if (counted !== null) return `${numberText(count)} ${counted}`
  if (item.label !== "") return `${numberText(count)} · ${item.label}`
  if (item.name !== "") return `${numberText(count)} · ${item.name}`
  return itemsCount(count)
}

const elementText = (value: unknown, item: TypeView): string =>
  summaryOf(factsOf(value, hintOf({ schema: item.schema })), { view: item, item: NO_TYPE })

const arraySummary: Summarizer = (facts, ctx) => {
  const list = listOf(facts.value)
  const head = list[0]
  const detail = head === undefined ? "" : clip(elementText(head, ctx.item), SUMMARY_CHARS)
  return rendered(countedText(list.length, ctx.item), detail, list.length)
}

const mediaSummary: Summarizer = (facts) => {
  if (facts.media === null) return rendered(EMPTY_TEXT, "медиа без ссылки")
  return rendered(mediaLabel(facts.media), facts.media.note)
}

const linkSummary: Summarizer = (facts) => {
  const src = facts.media?.src ?? String(facts.value)
  return rendered(linkText(src), src)
}

const enumSummary: Summarizer = (facts, ctx) => {
  const described = valueDescriptionOf(ctx.view, facts.value)
  return rendered(String(facts.value), described === "" ? clip(ctx.view.description) : clip(described))
}

const idSummary: Summarizer = (facts, ctx) => {
  const source = ctx.view.source === "" ? ctx.view.label : `источник: ${ctx.view.source}`
  return rendered(String(facts.value), clip(source))
}

const dateSummary: Summarizer = (facts) => rendered(dateText(String(facts.value)), String(facts.value))

const SUMMARIZERS: Readonly<Record<SummaryKind, Summarizer>> = {
  empty: emptySummary,
  text: textSummary,
  number: numberSummary,
  boolean: booleanSummary,
  object: objectSummary,
  array: arraySummary,
  image: mediaSummary,
  video: mediaSummary,
  audio: mediaSummary,
  file: mediaSummary,
  link: linkSummary,
  enum: enumSummary,
  id: idSummary,
  date: dateSummary,
}

const allBlank = (value: unknown): boolean => Object.values(recordOf(value)).every(isBlank)

type Refiner = (facts: ValueFacts, view: TypeView) => SummaryKind | null

const REFINERS: readonly Refiner[] = [
  (facts) => (facts.kind === "empty" ? "empty" : null),
  (facts) => (Array.isArray(facts.value) && facts.value.length === 0 ? "empty" : null),
  (facts) => (facts.kind === "object" && allBlank(facts.value) ? "empty" : null),
  (facts, view) => (view.kind === "enum" && typeof facts.value === "string" ? "enum" : null),
  (facts, view) => (view.kind === "id" && typeof facts.value === "string" ? "id" : null),
  (facts) => (facts.kind === "text" && isDateText(facts.value) ? "date" : null),
]

export const summaryKindOf = (facts: ValueFacts, view: TypeView): SummaryKind => {
  const found = REFINERS.reduce<SummaryKind | null>((kind, rule) => kind ?? rule(facts, view), null)
  return found ?? facts.kind
}

export const renderOf = (facts: ValueFacts, ctx: SummaryContext = NO_CONTEXT): Rendered =>
  SUMMARIZERS[summaryKindOf(facts, ctx.view)](facts, ctx)

export const summaryOf = (facts: ValueFacts, ctx: SummaryContext = NO_CONTEXT): string => renderOf(facts, ctx).text
