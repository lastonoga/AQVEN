import type { ValuePreview } from "./types.js"

export const PREVIEW_LIMIT = 2048

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8")

const byteLength = (text: string): number => encoder.encode(text).length

const jsonOf = (value: unknown): string => {
  const text = JSON.stringify(value, null, 2)
  return text === undefined ? String(value) : text
}

const sliceToBytes = (text: string, limit: number): string =>
  decoder.decode(encoder.encode(text).slice(0, limit)).replace(/\uFFFD+$/, "")

export const previewOf = (value: unknown, limit: number = PREVIEW_LIMIT): ValuePreview => {
  const text = jsonOf(value)
  const totalBytes = byteLength(text)
  if (totalBytes <= limit) return { text, bytes: totalBytes, totalBytes, truncated: false }
  const cut = sliceToBytes(text, limit)
  return { text: cut, bytes: byteLength(cut), totalBytes, truncated: true }
}

const UNITS: readonly { min: number; div: number; suffix: string }[] = [
  { min: 1024 * 1024, div: 1024 * 1024, suffix: "МБ" },
  { min: 1024, div: 1024, suffix: "КБ" },
]

const round1 = (n: number): number => Math.round(n * 10) / 10

export const formatBytes = (bytes: number): string => {
  const unit = UNITS.find((entry) => bytes >= entry.min)
  if (unit === undefined) return `${bytes} Б`
  return `${round1(bytes / unit.div)} ${unit.suffix}`
}

export const previewLabel = (preview: ValuePreview): string => {
  if (!preview.truncated) return formatBytes(preview.totalBytes)
  return `показано ${formatBytes(preview.bytes)} из ${formatBytes(preview.totalBytes)}`
}
