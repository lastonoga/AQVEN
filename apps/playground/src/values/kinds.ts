export type ValueKind =
  | "empty"
  | "text"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "link"

export type MediaKind = "image" | "video" | "audio" | "file"

export type MediaRef = {
  readonly src: string
  readonly poster: string
  readonly mime: string
  readonly name: string
  readonly bytes: number
  readonly inline: boolean
  readonly note: string
}

export type ValueFacts = {
  readonly kind: ValueKind
  readonly value: unknown
  readonly media: MediaRef | null
  readonly bytes: number
}

export type SummaryKind = ValueKind | "enum" | "id" | "date"

export type Rendered = {
  readonly text: string
  readonly detail: string
  readonly count: number
}

export type ValueSummary = {
  readonly kind: SummaryKind
  readonly text: string
  readonly detail: string
  readonly count: number
  readonly typeName: string
  readonly typeLabel: string
  readonly missing: readonly string[]
  readonly facts: ValueFacts
}

export const MEDIA_KINDS: readonly ValueKind[] = ["image", "video", "audio", "file"]

export const isMediaKind = (kind: ValueKind): kind is MediaKind =>
  MEDIA_KINDS.includes(kind)

export const MEDIA_ENVELOPE_KEY = "$media"
