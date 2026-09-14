import { isBlank, isRecord, itemViewOf, missingRequired, sizeLabel, summarize, typeViewOf } from "../values/index.js"
import type { TypeView } from "../values/index.js"
import type { Ir } from "../api/index.js"

export type LineTone = "data" | "number" | "muted" | "link" | "error" | "ok"

export type ValueLine = { key: string; text: string; tone: LineTone }

export type ValueBlock = { lines: ValueLine[]; more: string; empty: boolean }

export const VALUE_CHARS = 72

const KEY_CHARS = 18

const SCALARS = new Set(["string", "number", "boolean", "bigint"])

const clipMid = (text: string, limit: number): string => {
  if (text.length <= limit) return text
  const head = Math.ceil((limit - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (limit - 1 - head))}`
}

const clipEnd = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`

const flat = (text: string): string => text.replace(/\s+/g, " ").trim()

const toneOf = (value: unknown): LineTone => {
  if (typeof value === "number" || typeof value === "bigint") return "number"
  if (typeof value === "boolean") return "ok"
  if (typeof value === "string" && /^https?:\/\//.test(value)) return "link"
  return "data"
}

const PATH_KEYS = /(^|_)(id|url|path|hash|key|ref)($|_)/i

const scalarText = (key: string, value: unknown): string => {
  const text = flat(String(value))
  if (PATH_KEYS.test(key)) return clipMid(text, VALUE_CHARS)
  return clipEnd(text, VALUE_CHARS)
}

const orderedKeys = (value: Readonly<Record<string, unknown>>, view: TypeView): string[] => {
  const own = Object.keys(value)
  const first = view.required.filter((key) => own.includes(key))
  const rest = own.filter((key) => !first.includes(key) && !key.startsWith("_"))
  const hidden = own.filter((key) => key.startsWith("_"))
  return [...first, ...rest, ...hidden]
}

const nestedText = (value: unknown, ir: Ir | null): string => {
  if (Array.isArray(value) || isRecord(value)) return summarize(value, "", ir).text
  return flat(String(value))
}

const fieldLine = (key: string, value: unknown, ir: Ir | null): ValueLine => {
  if (value === null || value === undefined) return { key, text: "пусто", tone: "muted" }
  if (SCALARS.has(typeof value)) return { key, text: scalarText(key, value), tone: toneOf(value) }
  return { key, text: clipEnd(flat(nestedText(value, ir)), VALUE_CHARS), tone: "data" }
}

const recordLines = (
  value: Readonly<Record<string, unknown>>,
  limit: number,
  view: TypeView,
  ir: Ir | null,
): ValueBlock => {
  const keys = orderedKeys(value, view)
  const shown = keys.slice(0, limit)
  const missing = missingRequired(value, view)
  const rest = keys.length - shown.length
  const notes = [
    rest > 0 ? `+${rest} ${rest === 1 ? "поле" : "полей"}` : "",
    missing.length > 0 ? `не заполнено: ${missing.join(", ")}` : "",
  ].filter((note) => note !== "")
  return {
    lines: shown.map((key) => fieldLine(clipEnd(key, KEY_CHARS), value[key], ir)),
    more: notes.join(" · "),
    empty: keys.length === 0,
  }
}

const itemLines = (items: readonly unknown[], limit: number, view: TypeView, ir: Ir | null): ValueBlock => {
  const item = itemViewOf(ir, view)
  const shown = items.slice(0, limit)
  const rest = items.length - shown.length
  return {
    lines: shown.map((entry, index) => {
      const summary = summarize(entry, item.name, ir)
      return { key: `${index + 1}`, text: clipEnd(flat(summary.text), VALUE_CHARS), tone: "data" as LineTone }
    }),
    more: rest > 0 ? `ещё ${rest} из ${items.length}` : "",
    empty: items.length === 0,
  }
}

const textLines = (value: string, limit: number): ValueBlock => {
  const rows = value.split("\n")
  const shown = rows.slice(0, limit).map((row) => clipEnd(row, VALUE_CHARS))
  const rest = rows.length - shown.length
  return {
    lines: shown.map((text, index) => ({ key: index === 0 ? "" : "", text, tone: "data" as LineTone })),
    more: rest > 0 ? `+${rest} ${rest === 1 ? "строка" : "строк"}` : "",
    empty: value === "",
  }
}

const withSize = (block: ValueBlock, bytes: number, limit: number): ValueBlock => {
  if (bytes <= limit) return block
  return { ...block, more: [block.more, sizeLabel(bytes)].filter((part) => part !== "").join(" · ") }
}

export const SIZE_NOTE_FROM = 2048

export const valueLines = (value: unknown, limit: number, typeName: string, ir: Ir | null): ValueBlock => {
  const summary = summarize(value, typeName, ir)
  const view = typeViewOf(ir, typeName)

  if (isBlank(value)) {
    return { lines: [{ key: "", text: summary.text, tone: "muted" }], more: summary.detail, empty: true }
  }
  if (typeof value === "string") return withSize(textLines(value, limit), summary.facts.bytes, SIZE_NOTE_FROM)
  if (Array.isArray(value)) return withSize(itemLines(value, limit, view, ir), summary.facts.bytes, SIZE_NOTE_FROM)
  if (isRecord(value)) return withSize(recordLines(value, limit, view, ir), summary.facts.bytes, SIZE_NOTE_FROM)

  return { lines: [{ key: "", text: flat(String(value)), tone: toneOf(value) }], more: "", empty: false }
}
