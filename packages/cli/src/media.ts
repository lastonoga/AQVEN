import { textAt } from "./ir-types.js"
import type { TypeCatalog } from "./ir-types.js"

export type { TypeFacts, TypeCatalog } from "./ir-types.js"

export type MediaBlob = {
  id: string
  mime: string
  name: string
  body: Uint8Array
}

export type MediaStore = (blob: MediaBlob) => void

export type MediaEnvelope = {
  $media: string
  url: string | null
  poster?: string
  name: string
  bytes: number
  note?: string
}

export const BLOB_ROUTE = "/api/blobs"

export const blobUrl = (id: string): string => `${BLOB_ROUTE}/${id}`

const KEY_MIMES: ReadonlyArray<readonly [string, string]> = [
  ["thumbnail", "image/png"],
  ["screenshot", "image/png"],
  ["picture", "image/png"],
  ["image", "image/png"],
  ["photo", "image/png"],
  ["avatar", "image/png"],
  ["video", "video/mp4"],
  ["audio", "audio/wav"],
  ["voice", "audio/wav"],
  ["attachment", "application/pdf"],
]

const flatten = (name: string): string => name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()

const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter((part) => part !== "")
    .map((part) => part.toLowerCase())

const startsWithStem = (stem: string, name: string): boolean => {
  if (flatten(name).startsWith(stem)) return true
  return wordsOf(name).some((word) => word.startsWith(stem))
}

export const mimeOfName = (name: string): string =>
  KEY_MIMES.find(([stem]) => startsWithStem(stem, name))?.[1] ?? ""

export const mimeOfType = (types: TypeCatalog | undefined, name: string): string => {
  const entry = types?.[name]
  const schema = entry?.schema
  const declared = schema === undefined ? "" : textAt(schema, "contentMediaType")
  if (declared !== "") return declared
  return mimeOfName(name)
}

const familyOf = (mime: string): string => mime.split("/")[0] ?? ""

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/svg+xml": "svg",
  "audio/wav": "wav",
  "text/plain": "txt",
}

const PALETTE = ["#0f172a", "#1e293b", "#312e81", "#164e63", "#3f2d12"]
const INK = ["#7dd3fc", "#a5b4fc", "#fcd34d", "#86efac", "#f9a8d4"]

const pick = (list: readonly string[], rnd: () => number, fallback: string): string =>
  list[Math.floor(rnd() * list.length)] ?? fallback

const svgBody = (label: string, rnd: () => number): Uint8Array => {
  const back = pick(PALETTE, rnd, "#0f172a")
  const ink = pick(INK, rnd, "#7dd3fc")
  const cx = 120 + Math.floor(rnd() * 240)
  const cy = 70 + Math.floor(rnd() * 130)
  const r = 40 + Math.floor(rnd() * 60)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">`,
    `<rect width="480" height="270" fill="${back}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink}" fill-opacity="0.35"/>`,
    `<rect x="24" y="206" width="432" height="40" rx="6" fill="#000" fill-opacity="0.35"/>`,
    `<text x="40" y="232" font-family="monospace" font-size="18" fill="${ink}">${label}</text>`,
    `</svg>`,
  ].join("")
  return new TextEncoder().encode(svg)
}

const WAV_RATE = 8000
const WAV_SECONDS = 0.6
const WAV_HEADER = 44
const WAV_AMPLITUDE = 11000

const ascii = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

const wavBody = (rnd: () => number): Uint8Array => {
  const samples = Math.floor(WAV_RATE * WAV_SECONDS)
  const buffer = new ArrayBuffer(WAV_HEADER + samples * 2)
  const view = new DataView(buffer)
  ascii(view, 0, "RIFF")
  view.setUint32(4, 36 + samples * 2, true)
  ascii(view, 8, "WAVE")
  ascii(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, WAV_RATE, true)
  view.setUint32(28, WAV_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(view, 36, "data")
  view.setUint32(40, samples * 2, true)
  const freq = 180 + Math.floor(rnd() * 320)
  for (let i = 0; i < samples; i++) {
    const fade = 1 - i / samples
    view.setInt16(WAV_HEADER + i * 2, Math.round(Math.sin((2 * Math.PI * freq * i) / WAV_RATE) * WAV_AMPLITUDE * fade), true)
  }
  return new Uint8Array(buffer)
}

const textBody = (label: string, mime: string): Uint8Array =>
  new TextEncoder().encode(`Заглушка плейграунда\nобъявленный тип: ${mime}\nисточник: ${label}\n`)

type Built = { mime: string; body: Uint8Array }

type Builder = (label: string, mime: string, rnd: () => number) => Built

const BUILDERS: Readonly<Record<string, Builder>> = {
  image: (label, _mime, rnd) => ({ mime: "image/svg+xml", body: svgBody(label, rnd) }),
  audio: (_label, _mime, rnd) => ({ mime: "audio/wav", body: wavBody(rnd) }),
  text: (label, mime) => ({ mime: "text/plain", body: textBody(label, mime) }),
  application: (label, mime) => ({ mime: "text/plain", body: textBody(label, mime) }),
}

const NO_BUILDER = "видео заглушкой не генерируется: показан кадр-заставка, дорожки нет"

const fileName = (label: string, mime: string): string => {
  const extension = EXTENSIONS[mime] ?? mime.split("/")[1] ?? "bin"
  return `${flatten(label) === "" ? "stub" : flatten(label)}.${extension}`
}

const substituted = (declared: string, actual: string): string | undefined => {
  if (declared === actual) return undefined
  return `заглушка: вместо ${declared} сгенерирован ${actual}`
}

export type MediaContext = {
  types?: TypeCatalog
  store: MediaStore | null
}

const stored = (context: MediaContext, id: string, name: string, built: Built): string | null => {
  if (context.store === null) return null
  context.store({ id, mime: built.mime, name, body: built.body })
  return blobUrl(id)
}

const NO_STORE = "пример: блоб не создан, прогона нет"

const noteOf = (...parts: ReadonlyArray<string | undefined>): { note?: string } => {
  const note = parts.filter((part): part is string => part !== undefined && part !== "").join("; ")
  return note === "" ? {} : { note }
}

const posterOnly = (
  context: MediaContext,
  id: string,
  mime: string,
  label: string,
  rnd: () => number,
): MediaEnvelope => {
  const built: Built = { mime: "image/svg+xml", body: svgBody(label, rnd) }
  const poster = stored(context, `${id}p`, fileName(label, built.mime), built)
  return {
    $media: mime,
    url: null,
    ...(poster === null ? {} : { poster }),
    name: fileName(label, mime),
    bytes: 0,
    ...noteOf(NO_BUILDER, poster === null ? NO_STORE : undefined),
  }
}

const direct = (context: MediaContext, id: string, mime: string, label: string, rnd: () => number): MediaEnvelope => {
  const built = BUILDERS[familyOf(mime)]?.(label, mime, rnd)
  if (built === undefined) return posterOnly(context, id, mime, label, rnd)
  const name = fileName(label, built.mime)
  const url = stored(context, id, name, built)
  return {
    $media: built.mime,
    url,
    name,
    bytes: built.body.length,
    ...noteOf(substituted(mime, built.mime), url === null ? NO_STORE : undefined),
  }
}

export const makeMedia = (
  context: MediaContext,
  id: string,
  mime: string,
  label: string,
  rnd: () => number,
): MediaEnvelope => direct(context, id, mime, label, rnd)
