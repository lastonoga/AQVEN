export type Interval = { readonly low: number; readonly high: number }

const Z = 1.96
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const UINT32 = 2 ** 32
const MEDIAN_FACTOR = 1.253
const TAIL_FACTOR = 2.5
const HEX_WORDS = 4

const mix = (seed: number): number => {
  let value = seed
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35)
  value ^= value >>> 16
  return value >>> 0
}

export const hashOf = (text: string): number => {
  let hash = FNV_OFFSET
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return mix(hash >>> 0)
}

export const unitOf = (key: string): number => hashOf(key) / UINT32

const hexWord = (key: string, index: number): string => hashOf(`${key}#${String(index)}`).toString(16).padStart(8, "0")

export const uuidOf = (key: string): string => {
  const hex = Array.from({ length: HEX_WORDS }, (_, index) => hexWord(key, index)).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))

export const roundTo = (value: number, digits: number): number => {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

export const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

export const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : sum(values) / values.length)

export const deviation = (values: readonly number[]): number => {
  if (values.length < 2) return 0
  const center = mean(values)
  return Math.sqrt(sum(values.map((value) => (value - center) ** 2)) / (values.length - 1))
}

export const percentile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length === 0) return 0
  const position = (sorted.length - 1) * share
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower] ?? 0
  const high = sorted[upper] ?? low
  return low + (high - low) * (position - lower)
}

export const wilson = (rate: number, size: number): Interval => {
  if (size <= 0) return { low: 0, high: 1 }
  const z2 = Z * Z
  const denominator = 1 + z2 / size
  const center = (rate + z2 / (2 * size)) / denominator
  const spread = (Z * Math.sqrt((rate * (1 - rate)) / size + z2 / (4 * size * size))) / denominator
  return { low: clamp(center - spread, 0, 1), high: clamp(center + spread, 0, 1) }
}

export const meanInterval = (values: readonly number[]): Interval => {
  const center = mean(values)
  const spread = values.length === 0 ? 0 : (Z * deviation(values)) / Math.sqrt(values.length)
  return { low: center - spread, high: center + spread }
}

export const medianInterval = (values: readonly number[], center: number): Interval => {
  const spread = values.length === 0 ? 0 : (Z * MEDIAN_FACTOR * deviation(values)) / Math.sqrt(values.length)
  return { low: Math.max(0, center - spread), high: center + spread }
}

export const tailInterval = (values: readonly number[], center: number): Interval => {
  const spread = values.length === 0 ? 0 : (Z * TAIL_FACTOR * deviation(values)) / Math.sqrt(values.length)
  return { low: Math.max(0, center - spread), high: center + spread }
}

export const effectiveSize = (cases: number, repeats: number, icc: number): number => (cases * repeats) / (1 + (repeats - 1) * icc)

export const halfWidthOf = (spread: number, size: number): number => (size <= 0 ? Number.POSITIVE_INFINITY : (Z * spread) / Math.sqrt(size))

export const casesFor = (spread: number, margin: number, repeats: number, icc: number): number =>
  Math.ceil(((Z * spread) / margin) ** 2 * ((1 + (repeats - 1) * icc) / repeats))

export const combinedHalfWidth = (left: number, right: number, pairing: number): number => Math.sqrt(left * left + right * right) * pairing
