import { createContext, useContext, useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import { ChoiceGroup } from "./choice"
import { MediaOutput, type OutputMedia } from "./media-output"

export type ValueMode = "flat" | "json"

export type FlatEntry = { readonly path: string; readonly value: string }
export type FlatMediaEntry = { readonly path: string; readonly media: OutputMedia }

type ValueDisplayState = { readonly mode: ValueMode; readonly setMode: (mode: ValueMode) => void }

const ROOT_LABEL = "value"
const EMPTY_OBJECT = "empty object"
const EMPTY_LIST = "empty list"
const PATH_WORD = /(^|\.)([^.[\]]+)/gu

const ValueDisplayContext = createContext<ValueDisplayState>({ mode: "flat", setMode: () => undefined })

export function ValueDisplayProvider({ children, mode: controlledMode }: { readonly children: ReactNode; readonly mode?: ValueMode }) {
  const [localMode, setMode] = useState<ValueMode>("flat")
  return <ValueDisplayContext value={{ mode: controlledMode ?? localMode, setMode }}>{children}</ValueDisplayContext>
}

export const useValueMode = (): ValueMode => useContext(ValueDisplayContext).mode

export function ValueModeSwitch() {
  const t = useTranslations("common.valueMode")
  const { mode, setMode } = useContext(ValueDisplayContext)
  return (
    <ChoiceGroup
      appearance="segmented"
      size="sm"
      label={t("label")}
      items={[{ value: "flat", label: t("flat") }, { value: "json", label: t("json") }]}
      value={mode}
      onValueChange={setMode}
    />
  )
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type MediaValue = Readonly<Record<string, unknown>> & {
  readonly $media: string
  readonly blob_id: string
  readonly size_bytes: number
}

const isMediaValue = (value: unknown): value is MediaValue =>
  isRecord(value) && typeof value["$media"] === "string" && typeof value["blob_id"] === "string" && typeof value["size_bytes"] === "number"

const childPath = (parent: string, key: string): string => (parent.length === 0 ? key : `${parent}.${key}`)

const itemPath = (parent: string, index: number): string => `${parent}[${String(index)}]`

const scalarText = (value: unknown): string => {
  if (typeof value === "string") return value
  if (value === null) return "null"
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

const walkValue = (
  current: unknown,
  path: string,
  scalar: (path: string, value: string) => void,
  media?: (path: string, value: MediaValue) => void,
): void => {
  if (media !== undefined && isMediaValue(current)) {
    media(path || ROOT_LABEL, current)
    return
  }
  if (Array.isArray(current)) {
    if (current.length === 0) scalar(path || ROOT_LABEL, EMPTY_LIST)
    current.forEach((item: unknown, index) => { walkValue(item, itemPath(path, index), scalar, media) })
    return
  }
  if (isRecord(current)) {
    const fields = Object.entries(current)
    if (fields.length === 0) scalar(path || ROOT_LABEL, EMPTY_OBJECT)
    fields.forEach(([key, item]) => { walkValue(item, childPath(path, key), scalar, media) })
    return
  }
  scalar(path || ROOT_LABEL, scalarText(current))
}

export const flattenValue = (value: unknown): readonly FlatEntry[] => {
  const entries: FlatEntry[] = []
  walkValue(value, "", (path, text) => { entries.push({ path, value: text }) })
  return entries
}

export const flattenValueWithMedia = (value: unknown): readonly (FlatEntry | FlatMediaEntry)[] => {
  const entries: (FlatEntry | FlatMediaEntry)[] = []
  walkValue(value, "", (path, text) => { entries.push({ path, value: text }) }, (path, descriptor) => {
    entries.push({ path, media: {
      slot: path,
      mediaType: descriptor.$media,
      blobId: descriptor.blob_id,
      bytes: descriptor.size_bytes,
      name: typeof descriptor["name"] === "string" ? descriptor["name"] : null,
      ...(typeof descriptor["poster_blob_id"] === "string" ? { posterBlobId: descriptor["poster_blob_id"] } : {}),
    } })
  })
  return entries
}

export const parseValueText = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const jsonText = (value: unknown): string => JSON.stringify(value, null, 2)

const withoutMedia = (value: unknown): unknown => {
  if (isMediaValue(value)) return undefined
  if (Array.isArray(value)) {
    const items = value.map(withoutMedia).filter((item) => item !== undefined)
    return items.length === 0 && value.length > 0 ? undefined : items
  }
  if (isRecord(value)) {
    const fields = Object.entries(value).flatMap(([key, item]) => {
      const remaining = withoutMedia(item)
      return remaining === undefined ? [] : [[key, remaining] as const]
    })
    return fields.length === 0 && Object.keys(value).length > 0 ? undefined : Object.fromEntries(fields)
  }
  return value
}

const pathWords = (path: string): readonly string[] =>
  Array.from(path.matchAll(PATH_WORD), (match) => match[2] ?? "")

const shortPath = (path: string, widths: readonly number[]): string => {
  let index = 0
  return path.replace(PATH_WORD, (_match: string, separator: string, word: string) => {
    const shortened = Array.from(word).slice(0, widths[index] ?? 1).join("")
    index += 1
    return `${separator}${shortened}`
  })
}

export const shortenPaths = (paths: readonly string[]): readonly string[] => {
  const words = paths.map(pathWords)
  const widths = words.map((parts) => parts.map(() => 1))
  const groups = new Map<string, number[]>()
  paths.forEach((path, index) => {
    const alias = shortPath(path, widths[index] ?? [])
    const group = groups.get(alias) ?? []
    group.push(index)
    groups.set(alias, group)
  })
  for (const group of groups.values()) {
    for (let left = 0; left < group.length; left += 1) {
      const leftIndex = group[left]
      if (leftIndex === undefined) continue
      for (let right = left + 1; right < group.length; right += 1) {
        const rightIndex = group[right]
        if (rightIndex === undefined) continue
        const leftWords = words[leftIndex] ?? []
        const rightWords = words[rightIndex] ?? []
        const position = leftWords.findIndex((word, index) => word !== rightWords[index])
        if (position < 0) continue
        const leftChars = Array.from(leftWords[position] ?? "")
        const rightChars = Array.from(rightWords[position] ?? "")
        let common = 0
        while (common < leftChars.length && leftChars[common] === rightChars[common]) common += 1
        const leftWidths = widths[leftIndex]
        const rightWidths = widths[rightIndex]
        if (leftWidths !== undefined) leftWidths[position] = Math.max(leftWidths[position] ?? 1, Math.min(leftChars.length, common + 1))
        if (rightWidths !== undefined) rightWidths[position] = Math.max(rightWidths[position] ?? 1, Math.min(rightChars.length, common + 1))
      }
    }
  }
  return paths.map((path, index) => shortPath(path, widths[index] ?? []))
}

function FlatRow({ entry, alias }: { readonly entry: FlatEntry; readonly alias: string }) {
  return (
    <li className="min-h-4.5 min-w-0 whitespace-pre-wrap wrap-anywhere">
      <span className="aqven-flat-value-full text-muted-foreground" title={entry.path}>{entry.path}:</span>
      <abbr className="aqven-flat-value-short text-muted-foreground" title={entry.path} aria-label={`${entry.path}:`}>{alias}:</abbr>{" "}
      <span className="aqven-flat-value-data text-foreground">{entry.value}</span>
    </li>
  )
}

export function FlatEntries({ entries }: { readonly entries: readonly FlatEntry[] }) {
  const aliases = shortenPaths(entries.map((entry) => entry.path))
  return (
    <ul className="aqven-flat-value min-w-0 font-mono text-[11px] leading-[1.35] select-text">
      {entries.map((entry, index) => <FlatRow key={`${entry.path}-${String(index)}`} entry={entry} alias={aliases[index] ?? entry.path} />)}
    </ul>
  )
}

export function StructuredValue({ value, compact = false, media = [], mediaOnly = false }: { readonly value: unknown; readonly compact?: boolean; readonly media?: readonly OutputMedia[] | undefined; readonly mediaOnly?: boolean | undefined }) {
  const mode = useValueMode()
  const visibleValue = mode === "json" ? value : mediaOnly ? undefined : media.length > 0 ? withoutMedia(value) : value
  const entries = visibleValue === undefined || mode === "json" ? [] : flattenValue(visibleValue)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {mode === "flat" ? media.map((item, index) => <MediaOutput key={`${item.slot}-${item.blobId}-${String(index)}`} media={item} compact={compact} />) : null}
      {visibleValue === undefined ? null : mode === "json" ? (
        <pre className={`${compact ? "max-h-24 overflow-auto" : ""} min-w-0 whitespace-pre-wrap wrap-anywhere font-mono text-[11px] leading-[1.35] select-text`}>{jsonText(visibleValue)}</pre>
      ) : (
        <FlatEntries entries={entries} />
      )}
    </div>
  )
}
