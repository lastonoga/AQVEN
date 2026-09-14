import { previewOf } from "../refs/index.js"
import { NO_HINT, isBinaryEncoding, isUrlFormat } from "./hint.js"
import { MEDIA_ENVELOPE_KEY } from "./kinds.js"
import { extensionOf, fileNameOf, kindOfMime, mimeOfPath, normalizeMime } from "./mime.js"
import type { ValueHint } from "./hint.js"
import type { MediaRef, ValueFacts, ValueKind } from "./kinds.js"

const DATA_URI = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?((?:;[a-z0-9-]+=[^;,]*)*)(;base64)?,/i
const ABSOLUTE_URL = /^https?:\/\/\S+$/i
const ROOT_PATH = /^\/[^\s?#]*(\?\S*)?$/
const BASE64_BODY = /^[A-Za-z0-9+/\r\n]{64,}={0,2}$/
const API_PREFIX = "/api/"
const BASE64_RATIO = 3 / 4

const encoder = new TextEncoder()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const textOf = (bag: Readonly<Record<string, unknown>>, keys: readonly string[]): string => {
  const found = keys.map((key) => bag[key]).find((value) => typeof value === "string" && value !== "")
  return typeof found === "string" ? found : ""
}

const numberOf = (bag: Readonly<Record<string, unknown>>, key: string): number => {
  const value = bag[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export const bytesOf = (value: unknown): number => {
  if (typeof value === "string") return encoder.encode(value).length
  return previewOf(value).totalBytes
}

const paddingOf = (payload: string): number => (payload.match(/=+$/)?.[0].length ?? 0)

const base64Bytes = (payload: string): number => {
  const clean = payload.replace(/\s/g, "")
  return Math.max(0, Math.floor(clean.length * BASE64_RATIO) - paddingOf(clean))
}

const decodeSafe = (payload: string): string => {
  try {
    return decodeURIComponent(payload)
  } catch {
    return payload
  }
}

const dataUriBytes = (src: string): number => {
  const comma = src.indexOf(",")
  if (comma < 0) return 0
  const payload = src.slice(comma + 1)
  if (!src.slice(0, comma).toLowerCase().includes(";base64")) return encoder.encode(decodeSafe(payload)).length
  return base64Bytes(payload)
}

const mediaRef = (part: Partial<MediaRef> & { mime: string }): MediaRef => ({
  src: part.src ?? "",
  poster: part.poster ?? "",
  mime: normalizeMime(part.mime),
  name: part.name ?? "",
  bytes: part.bytes ?? 0,
  inline: part.inline ?? false,
  note: part.note ?? "",
})

const named = (media: MediaRef): MediaRef =>
  media.name === "" ? { ...media, name: fileNameOf(media.src, media.mime) } : media

const mediaFacts = (kind: ValueKind, value: unknown, media: MediaRef): ValueFacts => {
  const filled = named(media)
  return { kind, value, media: filled, bytes: filled.bytes > 0 ? filled.bytes : bytesOf(value) }
}

const plainFacts = (kind: ValueKind, value: unknown): ValueFacts => ({
  kind,
  value,
  media: null,
  bytes: bytesOf(value),
})

type Probe = (value: unknown, hint: ValueHint) => ValueFacts | null

const probeEmpty: Probe = (value) => {
  if (value === undefined || value === null) return { kind: "empty", value, media: null, bytes: 0 }
  if (value === "") return { kind: "empty", value, media: null, bytes: 0 }
  return null
}

const ENVELOPE_SRC_KEYS = ["url", "src", "href", "data", "uri"]
const ENVELOPE_NAME_KEYS = ["name", "filename", "title"]
const ENVELOPE_NOTE_KEYS = ["note", "reason"]

const sizeOfSource = (declared: number, src: string): number => {
  if (declared > 0) return declared
  if (src.startsWith("data:")) return dataUriBytes(src)
  return 0
}

const probeEnvelope: Probe = (value, hint) => {
  if (!isRecord(value)) return null
  const declared = value[MEDIA_ENVELOPE_KEY]
  if (typeof declared !== "string" || declared === "") return null
  const mime = normalizeMime(declared) === "" ? hint.mediaType : normalizeMime(declared)
  const src = textOf(value, ENVELOPE_SRC_KEYS)
  return mediaFacts(
    kindOfMime(mime) ?? "file",
    value,
    mediaRef({
      mime,
      src,
      poster: textOf(value, ["poster"]),
      name: textOf(value, ENVELOPE_NAME_KEYS),
      bytes: sizeOfSource(numberOf(value, "bytes"), src),
      inline: src.startsWith("data:"),
      note: textOf(value, ENVELOPE_NOTE_KEYS),
    }),
  )
}

const probeDataUri: Probe = (value, hint) => {
  if (typeof value !== "string") return null
  const matched = DATA_URI.exec(value)
  if (matched === null) return null
  const mime = normalizeMime(matched[1] ?? "") === "" ? hint.mediaType : normalizeMime(matched[1] ?? "")
  return mediaFacts(
    kindOfMime(mime) ?? "file",
    value,
    mediaRef({ mime, src: value, bytes: dataUriBytes(value), inline: true }),
  )
}

const isServedPath = (value: string): boolean =>
  ROOT_PATH.test(value) && (value.startsWith(API_PREFIX) || extensionOf(value) !== "")

const probeUrl: Probe = (value, hint) => {
  if (typeof value !== "string") return null
  const isUrl = ABSOLUTE_URL.test(value) || isServedPath(value)
  if (!isUrl && !isUrlFormat(hint)) return null
  const mime = mimeOfPath(value) === "" ? hint.mediaType : mimeOfPath(value)
  const kind = kindOfMime(mime)
  if (kind === null) return mediaFacts("link", value, mediaRef({ mime: "", src: value, name: value }))
  return mediaFacts(kind, value, mediaRef({ mime, src: value }))
}

const probeBase64: Probe = (value, hint) => {
  if (typeof value !== "string") return null
  if (hint.mediaType === "" || !isBinaryEncoding(hint)) return null
  if (!BASE64_BODY.test(value.trim())) return null
  const src = `data:${hint.mediaType};base64,${value.trim()}`
  return mediaFacts(
    kindOfMime(hint.mediaType) ?? "file",
    value,
    mediaRef({ mime: hint.mediaType, src, bytes: base64Bytes(value), inline: true }),
  )
}

const PRIMITIVE_KINDS: Readonly<Record<string, ValueKind>> = {
  number: "number",
  bigint: "number",
  boolean: "boolean",
  string: "text",
}

const probePrimitive: Probe = (value) => {
  const kind = PRIMITIVE_KINDS[typeof value]
  if (kind === undefined) return null
  return plainFacts(kind, value)
}

const probeArray: Probe = (value) => (Array.isArray(value) ? plainFacts("array", value) : null)

const probeObject: Probe = (value) => (isRecord(value) ? plainFacts("object", value) : null)

const PROBES: readonly Probe[] = [
  probeEmpty,
  probeEnvelope,
  probeDataUri,
  probeUrl,
  probeBase64,
  probePrimitive,
  probeArray,
  probeObject,
]

export const factsOf = (value: unknown, hint: ValueHint = NO_HINT): ValueFacts => {
  for (const probe of PROBES) {
    const found = probe(value, hint)
    if (found !== null) return found
  }
  return plainFacts("text", value)
}

export const mediaOf = (value: unknown, hint: ValueHint = NO_HINT): MediaRef | null => factsOf(value, hint).media

export const isPlayable = (media: MediaRef): boolean => media.src !== ""
