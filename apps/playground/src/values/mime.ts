import type { MediaKind } from "./kinds.js"

const FAMILY_KINDS: Readonly<Record<string, MediaKind>> = {
  image: "image",
  video: "video",
  audio: "audio",
}

const EXACT_KINDS: Readonly<Record<string, MediaKind>> = {
  "application/pdf": "file",
  "application/zip": "file",
  "application/octet-stream": "file",
  "text/csv": "file",
}

const EXTENSION_MIMES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  zip: "application/zip",
  csv: "text/csv",
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/csv": "csv",
}

export const normalizeMime = (mime: string): string => mime.split(";")[0]?.trim().toLowerCase() ?? ""

const familyOf = (mime: string): string => normalizeMime(mime).split("/")[0] ?? ""

export const kindOfMime = (mime: string): MediaKind | null => {
  const exact = EXACT_KINDS[normalizeMime(mime)]
  if (exact !== undefined) return exact
  const family = FAMILY_KINDS[familyOf(mime)]
  if (family !== undefined) return family
  return null
}

export const extensionOf = (path: string): string => {
  const tail = path.split(/[?#]/)[0] ?? ""
  const name = tail.split("/").pop() ?? ""
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

export const mimeOfExtension = (extension: string): string => EXTENSION_MIMES[extension] ?? ""

export const mimeOfPath = (path: string): string => mimeOfExtension(extensionOf(path))

export const extensionOfMime = (mime: string): string => MIME_EXTENSIONS[normalizeMime(mime)] ?? ""

export const fileNameOf = (src: string, mime: string): string => {
  const tail = src.split(/[?#]/)[0] ?? ""
  const name = decodeURIComponent(tail.split("/").pop() ?? "")
  if (name !== "" && !name.startsWith("data:")) return name
  const extension = extensionOfMime(mime)
  return extension === "" ? "файл" : `файл.${extension}`
}
