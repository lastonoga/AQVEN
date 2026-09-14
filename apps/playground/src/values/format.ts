import { formatBytes } from "../refs/index.js"
import { extensionOfMime } from "./mime.js"
import type { MediaRef, ValueFacts, ValueKind } from "./kinds.js"

export const SUMMARY_CHARS = 48

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

export const plural = (count: number, one: string, few: string, many: string): string => {
  const teens = count % 100
  if (teens >= 11 && teens <= 14) return many
  const last = count % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

export const clip = (text: string, limit = SUMMARY_CHARS): string => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

export const sizeLabel = (bytes: number): string => (bytes > 0 ? formatBytes(bytes) : "размер неизвестен")

export const formatLabel = (media: MediaRef): string => {
  const extension = extensionOfMime(media.mime)
  if (extension !== "") return extension.toUpperCase()
  return media.mime === "" ? "" : media.mime
}

export const mediaLabel = (media: MediaRef): string =>
  [media.name, formatLabel(media), sizeLabel(media.bytes)].filter((part) => part !== "").join(" · ")

const itemsLabel = (value: unknown): string => {
  if (!Array.isArray(value)) return KIND_LABELS.array
  return `массив · ${value.length} ${plural(value.length, "элемент", "элемента", "элементов")}`
}

const fieldsLabel = (value: unknown): string => {
  const keys = typeof value === "object" && value !== null ? Object.keys(value) : []
  if (keys.length === 0) return "{}"
  return clip(`{ ${keys.join(", ")} }`)
}

type Summarizer = (facts: ValueFacts) => string

const mediaSummary: Summarizer = (facts) => (facts.media === null ? "—" : mediaLabel(facts.media))

const SUMMARIZERS: Readonly<Record<ValueKind, Summarizer>> = {
  empty: () => "—",
  text: (facts) => clip(String(facts.value)),
  number: (facts) => String(facts.value),
  boolean: (facts) => String(facts.value),
  object: (facts) => fieldsLabel(facts.value),
  array: (facts) => itemsLabel(facts.value),
  image: mediaSummary,
  video: mediaSummary,
  audio: mediaSummary,
  file: mediaSummary,
  link: (facts) => clip(facts.media?.src ?? String(facts.value)),
}

export const summaryOf = (facts: ValueFacts): string => SUMMARIZERS[facts.kind](facts)
