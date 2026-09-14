import { normalizeMime } from "./mime.js"

export type ValueHint = {
  readonly mediaType: string
  readonly format: string
  readonly encoding: string
}

export const NO_HINT: ValueHint = { mediaType: "", format: "", encoding: "" }

const MEDIA_KEYS = ["contentMediaType", "mediaType", "x-media"]
const FORMAT_KEYS = ["format"]
const ENCODING_KEYS = ["contentEncoding", "encoding"]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const textAt = (bag: Readonly<Record<string, unknown>>, keys: readonly string[]): string => {
  const found = keys.map((key) => bag[key]).find((value) => typeof value === "string" && value !== "")
  return typeof found === "string" ? found : ""
}

const firstText = (...parts: readonly string[]): string => parts.find((part) => part !== "") ?? ""

const readHint = (bag: Readonly<Record<string, unknown>>): ValueHint => ({
  mediaType: normalizeMime(textAt(bag, MEDIA_KEYS)),
  format: textAt(bag, FORMAT_KEYS).toLowerCase(),
  encoding: textAt(bag, ENCODING_KEYS).toLowerCase(),
})

export const mergeHints = (base: ValueHint, extra: ValueHint): ValueHint => ({
  mediaType: firstText(base.mediaType, extra.mediaType),
  format: firstText(base.format, extra.format),
  encoding: firstText(base.encoding, extra.encoding),
})

export const hintOf = (source: unknown): ValueHint => {
  if (!isRecord(source)) return NO_HINT
  const own = readHint(source)
  const nested = source["schema"]
  if (!isRecord(nested)) return own
  return mergeHints(own, readHint(nested))
}

export const hintFor = (mediaType: string): ValueHint => ({ ...NO_HINT, mediaType: normalizeMime(mediaType) })

export const hasHint = (hint: ValueHint): boolean => hint !== NO_HINT && hint.mediaType !== ""

export const URL_FORMATS = new Set(["uri", "url", "iri", "uri-reference"])

export const isUrlFormat = (hint: ValueHint): boolean => URL_FORMATS.has(hint.format)

export const isBinaryEncoding = (hint: ValueHint): boolean => hint.encoding === "base64" || hint.format === "byte"
