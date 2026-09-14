import { factsOf } from "./detect.js"
import { EMPTY_TEXT, KIND_LABELS } from "./format.js"
import { isBlank, isRecord, recordOf } from "./guards.js"
import { plural } from "./russian.js"
import { clip, joinFacts, numberText } from "./text.js"
import type { ValueKind } from "./kinds.js"

export type DeltaKind = "same" | "added" | "removed" | "changed" | "reshaped" | "error" | "empty"

export type ValueDelta = {
  readonly kind: DeltaKind
  readonly text: string
  readonly added: number
  readonly removed: number
  readonly changed: number
}

type Pair = { readonly before: unknown; readonly after: unknown }

const ERROR_KEYS = ["error", "_error", "exception"]
const MESSAGE_KEYS = ["message", "error", "detail", "reason"]

const delta = (kind: DeltaKind, text: string, added = 0, removed = 0, changed = 0): ValueDelta => ({
  kind,
  text,
  added,
  removed,
  changed,
})

const sameList = (before: readonly unknown[], after: readonly unknown[]): boolean =>
  before.length === after.length && before.every((item, index) => deepEqual(item, after[index]))

const sameBag = (before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): boolean => {
  const keys = Object.keys(before)
  if (keys.length !== Object.keys(after).length) return false
  return keys.every((key) => key in after && deepEqual(before[key], after[key]))
}

export const deepEqual = (before: unknown, after: unknown): boolean => {
  if (Object.is(before, after)) return true
  if (Array.isArray(before) && Array.isArray(after)) return sameList(before, after)
  if (isRecord(before) && isRecord(after)) return sameBag(before, after)
  return false
}

const messageOf = (value: unknown): string => {
  const bag = recordOf(value)
  const found = MESSAGE_KEYS.map((key) => bag[key]).find((text) => typeof text === "string" && text !== "")
  return typeof found === "string" ? found : ""
}

const isErrorValue = (value: unknown): boolean => {
  if (value instanceof Error) return true
  if (!isRecord(value)) return false
  return ERROR_KEYS.some((key) => !isBlank(value[key]))
}

const errorText = (value: unknown): string => {
  if (value instanceof Error) return clip(value.message)
  const bag = recordOf(value)
  const nested = ERROR_KEYS.map((key) => bag[key]).find((item) => !isBlank(item))
  const text = typeof nested === "string" ? nested : messageOf(nested)
  return text === "" ? "" : clip(text)
}

const shapeOf = (value: unknown): ValueKind => factsOf(value).kind

const kindLabel = (value: unknown): string => KIND_LABELS[shapeOf(value)]

const countText = (count: number, one: string, few: string, many: string): string =>
  `${numberText(count)} ${plural(count, one, few, many)}`

const fieldsText = (count: number): string => countText(count, "поле", "поля", "полей")

const itemsText = (count: number): string => countText(count, "элемент", "элемента", "элементов")

const valuesText = (count: number): string => countText(count, "значение", "значения", "значений")

const mixedText = (added: number, removed: number, changed: number): string => {
  const parts = [
    added === 0 ? "" : `+${added}`,
    removed === 0 ? "" : `−${removed}`,
    changed === 0 ? "" : `изменено ${changed}`,
  ]
  return `${joinFacts(parts)} · поля`
}

const bagDelta = (before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): ValueDelta => {
  const added = Object.keys(after).filter((key) => !(key in before))
  const removed = Object.keys(before).filter((key) => !(key in after))
  const changed = Object.keys(after).filter((key) => key in before && !deepEqual(before[key], after[key]))
  if (added.length > 0 && removed.length === 0 && changed.length === 0)
    return delta("added", `добавлено ${fieldsText(added.length)}`, added.length)
  if (removed.length > 0 && added.length === 0 && changed.length === 0)
    return delta("removed", `удалено ${fieldsText(removed.length)}`, 0, removed.length)
  if (added.length === 0 && removed.length === 0)
    return delta("changed", `изменено ${valuesText(changed.length)}`, 0, 0, changed.length)
  return delta("changed", mixedText(added.length, removed.length, changed.length), added.length, removed.length, changed.length)
}

const listDelta = (before: readonly unknown[], after: readonly unknown[]): ValueDelta => {
  const grown = after.length - before.length
  if (grown > 0) return delta("added", `добавлено ${itemsText(grown)}`, grown)
  if (grown < 0) return delta("removed", `удалено ${itemsText(-grown)}`, 0, -grown)
  const changed = after.filter((item, index) => !deepEqual(before[index], item)).length
  return delta("changed", `изменено ${itemsText(changed)}`, 0, 0, changed)
}

const fromEmpty = (after: unknown): ValueDelta => {
  if (Array.isArray(after)) return listDelta([], after)
  if (isRecord(after)) return bagDelta({}, after)
  return delta("added", "появилось значение", 1)
}

type Rule = (pair: Pair) => ValueDelta | null

const failedValue = (pair: Pair): unknown => [pair.after, pair.before].find(isErrorValue)

const RULES: readonly Rule[] = [
  (pair) => {
    const failed = failedValue(pair)
    return failed === undefined ? null : delta("error", joinFacts(["ошибка", errorText(failed)]))
  },
  (pair) => (isBlank(pair.after) ? delta("empty", `${EMPTY_TEXT} на выходе`) : null),
  (pair) => (deepEqual(pair.before, pair.after) ? delta("same", "совпадает") : null),
  (pair) => (isBlank(pair.before) ? fromEmpty(pair.after) : null),
  (pair) =>
    shapeOf(pair.before) === shapeOf(pair.after)
      ? null
      : delta("reshaped", `сменилась форма: ${kindLabel(pair.before)} → ${kindLabel(pair.after)}`),
  (pair) => (Array.isArray(pair.before) && Array.isArray(pair.after) ? listDelta(pair.before, pair.after) : null),
  (pair) => (isRecord(pair.before) && isRecord(pair.after) ? bagDelta(pair.before, pair.after) : null),
]

export const deltaOf = (before: unknown, after: unknown): ValueDelta => {
  const pair: Pair = { before, after }
  const found = RULES.reduce<ValueDelta | null>((result, rule) => result ?? rule(pair), null)
  return found ?? delta("changed", "значение изменилось", 0, 0, 1)
}
