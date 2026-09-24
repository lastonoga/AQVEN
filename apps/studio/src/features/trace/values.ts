import type { ApiValueRef } from "@/domain"
import { parseValueText } from "@/components/studio"
import { plainLines } from "@/lib/text"
import type { MediaRef, ValueCell } from "./model"

type RefKind = ApiValueRef["kind"]
type RefOf<K extends RefKind> = Extract<ApiValueRef, { kind: K }>
type ReadValue = Omit<ValueCell, "ref">
type Reader<K extends RefKind> = (ref: RefOf<K>) => ReadValue
type Readers = { readonly [K in RefKind]: Reader<K> }

type MediaShape = {
  readonly $media: string
  readonly blob_id: string
  readonly size_bytes: number
  readonly name?: unknown
  readonly poster_blob_id?: unknown
}

const JSON_INDENT = 2
const BYTES_PER_UNIT = 1024
const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isMedia = (value: unknown): value is MediaShape =>
  isRecord(value) && typeof value["$media"] === "string" && typeof value["blob_id"] === "string" && typeof value["size_bytes"] === "number"

const mediaName = (value: MediaShape): string | null => (typeof value.name === "string" ? value.name : null)

const mediaIn = (slot: string, value: unknown): readonly MediaRef[] => {
  if (isMedia(value)) return [{
    slot, mediaType: value.$media, blobId: value.blob_id, bytes: value.size_bytes, name: mediaName(value),
    ...(typeof value.poster_blob_id === "string" ? { posterBlobId: value.poster_blob_id } : {}),
  }]
  if (Array.isArray(value)) return value.flatMap((item: unknown, index) => mediaIn(`${slot}[${String(index)}]`, item))
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => mediaIn(slot.length === 0 ? key : `${slot}.${key}`, item))
  return []
}

const isTextMediaType = (mediaType: string): boolean => {
  const mime = mediaType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  return mime.startsWith("text/") || mime === "application/json" || mime.endsWith("+json")
}

const isJsonMediaType = (mediaType: string): boolean => {
  const mime = mediaType.split(";", 1)[0]?.trim().toLowerCase()
  return mime === "application/json" || mime?.endsWith("+json") === true
}

export const blobTextValue = (text: string, mediaType: string): unknown =>
  isJsonMediaType(mediaType) ? parseValueText(text) : text

export const isBinaryMedia = (ref: ApiValueRef): boolean => ref.kind === "blob" && !isTextMediaType(ref.media_type)

export const prettyJson = (value: unknown): string => JSON.stringify(value, null, JSON_INDENT)

export const byteSize = (bytes: number): string => {
  const step = Math.min(SIZE_UNITS.length - 1, Math.max(0, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(BYTES_PER_UNIT))))
  return `${String(Math.round(bytes / BYTES_PER_UNIT ** step))} ${SIZE_UNITS[step] ?? "B"}`
}

const READERS: Readers = {
  inline: (ref) => {
    const text = prettyJson(ref.value)
    return {
      identity: { kind: "inline", hash: null, mediaType: null, bytes: null },
      value: ref.value,
      incomplete: false,
      text,
      lines: plainLines(text),
      media: mediaIn("", ref.value),
    }
  },
  blob: (ref) => ({
    identity: { kind: "blob", hash: ref.sha256, mediaType: ref.media_type, bytes: ref.size_bytes },
    value: blobTextValue(ref.preview, ref.media_type),
    incomplete: ref.truncated,
    text: ref.preview,
    lines: plainLines(ref.preview),
    media: isBinaryMedia(ref)
      ? [{ slot: ref.blob_id, mediaType: ref.media_type, blobId: ref.blob_id, bytes: ref.size_bytes, name: null }]
      : mediaIn("", blobTextValue(ref.preview, ref.media_type)),
  }),
}

const read = <K extends RefKind>(ref: RefOf<K>): ReadValue => {
  const reader: Reader<K> = READERS[ref.kind]
  return reader(ref)
}

export const valueCell = (ref: ApiValueRef | null, blobText?: string): ValueCell | null => {
  if (ref === null) return null
  const base = read(ref)
  if (ref.kind !== "blob" || blobText === undefined || isBinaryMedia(ref)) return { ref, ...base }
  const value = blobTextValue(blobText, ref.media_type)
  return { ref, ...base, value, text: blobText, lines: plainLines(blobText), incomplete: false, media: mediaIn("", value) }
}
