export const fnv1a = (input: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const unit = (seed: string): number => fnv1a(seed) / 4294967296

export const pickFrom = <T>(list: readonly T[], seed: string, fallback: T): T =>
  list[Math.floor(unit(seed) * list.length)] ?? fallback

export const hex6 = (seed: string): string => (fnv1a(seed) & 0xffffff).toString(16).padStart(6, "0")

export const hex8 = (seed: string): string => fnv1a(seed).toString(16).padStart(8, "0")

export const round2 = (value: number): number => Math.round(value * 100) / 100
