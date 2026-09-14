import { plural } from "./russian.js"

export const SUMMARY_CHARS = 48
export const FIELD_CHARS = 28

const SENTENCE_END = /[.!?…](\s|$)/
const THOUSAND = 1000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})([T ](\d{2}):(\d{2})(:\d{2})?)?/
const PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\//i

export const flatten = (text: string): string => text.replace(/\s+/g, " ").trim()

export const clip = (text: string, limit = SUMMARY_CHARS): string => {
  const flat = flatten(text)
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

export const firstSentence = (text: string): string => {
  const flat = flatten(text)
  const found = SENTENCE_END.exec(flat)
  if (found === null) return flat
  return flat.slice(0, found.index + 1)
}

const thousands = (count: number): string => `${(count / THOUSAND).toFixed(1).replace(".", ",")} тыс.`

export const charsNote = (count: number): string => {
  if (count <= 0) return ""
  if (count >= THOUSAND) return `+${thousands(count)} знаков`
  return `+${count} ${plural(count, "знак", "знака", "знаков")}`
}

const decimals = (value: number): number => (Number.isInteger(value) ? 0 : 2)

export const numberText = (value: number): string => {
  if (!Number.isFinite(value)) return String(value)
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals(value),
  }).format(value)
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
]

export type DateParts = { readonly year: string; readonly month: string; readonly day: string; readonly time: string }

export const datePartsOf = (value: string): DateParts | null => {
  const found = ISO_DATE.exec(value.trim())
  if (found === null) return null
  if (Number.isNaN(Date.parse(value.trim()))) return null
  const month = MONTHS[Number(found[2]) - 1]
  if (month === undefined) return null
  return {
    year: found[1] ?? "",
    month,
    day: String(Number(found[3])),
    time: found[5] === undefined ? "" : `${found[5]}:${found[6] ?? "00"}`,
  }
}

export const dateText = (value: string): string => {
  const parts = datePartsOf(value)
  if (parts === null) return clip(value)
  const day = `${parts.day} ${parts.month} ${parts.year}`
  return parts.time === "" ? day : `${day}, ${parts.time}`
}

export const isDateText = (value: unknown): boolean => typeof value === "string" && datePartsOf(value) !== null

export const linkText = (url: string): string => clip(url.replace(PROTOCOL, ""), SUMMARY_CHARS)

export const quoted = (text: string, limit = FIELD_CHARS): string => `«${clip(text, limit)}»`

export const joinFacts = (parts: readonly string[]): string => parts.filter((part) => part !== "").join(" · ")
