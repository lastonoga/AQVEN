import { flattenValue, type FlatEntry } from "@/components/studio/value-display"
import type { OutputMedia } from "@/components/studio/media-output"
import type { SchemaPresentationResponse, SchemaPresentationResult, SchemaPresentationTarget } from "@/api/schema"

export type PresentationSide = "input" | "output"
export type PresentationTarget = SchemaPresentationTarget
export type PresentationResult = SchemaPresentationResult
export type PresentationBatch = SchemaPresentationResponse

export type DisplayTone = "neutral" | "positive" | "warning" | "critical"
type Literal = string | number | boolean | null
type ScalarNode = { readonly path?: string; readonly value?: Literal; readonly represented_paths?: readonly string[]; readonly tone?: DisplayTone }
export type DisplayNode =
  | { readonly kind: "section"; readonly title?: string; readonly children: readonly DisplayNode[] }
  | { readonly kind: "list"; readonly title?: string; readonly children: readonly DisplayNode[] }
  | { readonly kind: "card"; readonly title: string; readonly description?: string | null; readonly tone?: DisplayTone; readonly children: readonly DisplayNode[] }
  | ({ readonly kind: "text" | "badge" } & ScalarNode)
  | ({ readonly kind: "field"; readonly label: string } & ScalarNode)
  | { readonly kind: "media"; readonly path: string; readonly alt?: string }
export type DisplayDocument = { readonly version: 1; readonly root: Extract<DisplayNode, { kind: "section" }> }

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const only = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key))
const optionalString = (value: unknown): boolean => value === undefined || value === null || typeof value === "string"
const literal = (value: unknown): value is Literal => value === null || ["string", "number", "boolean"].includes(typeof value)
const TONES: readonly DisplayTone[] = ["neutral", "positive", "warning", "critical"]
const isTone = (value: unknown): value is DisplayTone => typeof value === "string" && TONES.some((tone) => tone === value)
const pointerSegment = (segment: string): boolean => !/~(?![01])/u.test(segment)
export const validPointer = (pointer: unknown): pointer is string =>
  typeof pointer === "string" && (pointer === "" || (pointer.startsWith("/") && pointer.slice(1).split("/").every(pointerSegment)))

const scalar = (node: Record<string, unknown>): ScalarNode | null => {
  const hasPath = Object.hasOwn(node, "path")
  const hasValue = Object.hasOwn(node, "value")
  if (hasPath === hasValue) return null
  if (node.tone !== undefined && !isTone(node.tone)) return null
  const rawPaths = node.represented_paths
  if (rawPaths !== undefined && (!Array.isArray(rawPaths) || !rawPaths.every(validPointer) || (hasPath && rawPaths.length > 0))) return null
  const paths: readonly string[] = Array.isArray(rawPaths) ? rawPaths.filter(validPointer) : []
  const extras = { ...(paths.length === 0 ? {} : { represented_paths: paths }), ...(isTone(node.tone) ? { tone: node.tone } : {}) }
  if (hasPath) return validPointer(node.path) ? { path: node.path, ...extras } : null
  return literal(node.value) ? { value: node.value, ...extras } : null
}

const parseNode = (input: unknown, depth = 0): DisplayNode | null => {
  if (!record(input) || depth > 50) return null
  const { kind } = input
  if (kind === "section" || kind === "list") {
    if (!only(input, ["kind", "title", "children"]) || !optionalString(input.title) || !Array.isArray(input.children)) return null
    const children = input.children.map((child: unknown) => parseNode(child, depth + 1))
    if (children.some((child: DisplayNode | null) => child === null)) return null
    return { kind, ...(typeof input.title === "string" ? { title: input.title } : {}), children: children.filter((child): child is DisplayNode => child !== null) }
  }
  if (kind === "card") {
    if (!only(input, ["kind", "title", "description", "tone", "children"]) ||
      typeof input.title !== "string" || input.title.length === 0 ||
      !optionalString(input.description) || (input.tone !== undefined && !isTone(input.tone)) || !Array.isArray(input.children)) return null
    const children = input.children.map((child: unknown) => parseNode(child, depth + 1))
    if (children.some((child: DisplayNode | null) => child === null)) return null
    return { kind, title: input.title,
      ...(typeof input.description === "string" ? { description: input.description } : {}),
      ...(isTone(input.tone) ? { tone: input.tone } : {}),
      children: children.filter((child): child is DisplayNode => child !== null) }
  }
  if (kind === "text" || kind === "badge" || kind === "field") {
    const keys = ["kind", "path", "value", "represented_paths", "tone", ...(kind === "field" ? ["label"] : [])]
    if (!only(input, keys)) return null
    const source = scalar(input)
    if (source === null) return null
    if (kind === "field") return typeof input.label === "string" && input.label.length > 0 ? { kind, label: input.label, ...source } : null
    return { kind, ...source }
  }
  if (kind === "media") {
    if (!only(input, ["kind", "path", "alt"]) || !validPointer(input.path) || !optionalString(input.alt)) return null
    return { kind: "media", path: input.path, ...(typeof input.alt === "string" ? { alt: input.alt } : {}) }
  }
  return null
}

export const parseDisplayDocument = (input: unknown): DisplayDocument | null => {
  if (!record(input) || !only(input, ["version", "root"]) || input.version !== 1) return null
  const root = parseNode(input.root)
  return root?.kind === "section" ? { version: 1, root } : null
}

export type PointerResult = { readonly found: true; readonly value: unknown } | { readonly found: false }

export const resolvePointer = (value: unknown, pointer: string): PointerResult => {
  if (!validPointer(pointer)) return { found: false }
  if (pointer === "") return { found: true, value }
  let current: unknown = value
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~")
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= current.length) return { found: false }
      current = current[Number(key)]
    } else if (record(current) && Object.hasOwn(current, key)) current = current[key]
    else return { found: false }
  }
  return { found: true, value: current }
}

export const mediaAt = (value: unknown, path: string, alt: string | undefined, media: readonly OutputMedia[], mediaOnly = false): OutputMedia | null => {
  const resolved = resolvePointer(value, path)
  if (!resolved.found) return null
  const item = resolved.value
  if (record(item) && typeof item["$media"] === "string" && typeof item["blob_id"] === "string" && typeof item["size_bytes"] === "number") {
    return { slot: alt ?? path, mediaType: item["$media"], blobId: item["blob_id"], bytes: item["size_bytes"],
      name: alt ?? (typeof item["name"] === "string" ? item["name"] : null),
      ...(typeof item["poster_blob_id"] === "string" ? { posterBlobId: item["poster_blob_id"] } : {}) }
  }
  const first = media[0]
  return mediaOnly && path === "" && media.length === 1 && first !== undefined ? { ...first, name: alt ?? first.name } : null
}

const walkNodes = (node: DisplayNode): readonly DisplayNode[] =>
  node.kind === "section" || node.kind === "list" || node.kind === "card" ? [node, ...node.children.flatMap(walkNodes)] : [node]

export const documentPointersValid = (value: unknown, document: DisplayDocument): boolean =>
  walkNodes(document.root).every((node) => {
    if (node.kind === "section" || node.kind === "list" || node.kind === "card") return true
    if (typeof node.path === "string" && !resolvePointer(value, node.path).found) return false
    if (node.kind === "media") return true
    return (node.represented_paths ?? []).every((path) => resolvePointer(value, path).found)
  })

export const renderableDocument = (raw: unknown, value: unknown, media: readonly OutputMedia[], mediaOnly = false, example = false): DisplayDocument | null => {
  const document = parseDisplayDocument(raw)
  if (document === null || !documentPointersValid(value, document)) return null
  if (example) return document
  const mediaValid = walkNodes(document.root).every((node) => node.kind !== "media" || mediaAt(value, node.path, node.alt, media, mediaOnly) !== null)
  return mediaValid ? document : null
}

const escapePointer = (key: string): string => key.replaceAll("~", "~0").replaceAll("/", "~1")
const leafPointers = (value: unknown, pointer = ""): readonly string[] => {
  if (Array.isArray(value)) return value.length === 0 ? [pointer] : value.flatMap((item, index) => leafPointers(item, `${pointer}/${String(index)}`))
  if (record(value)) {
    const entries = Object.entries(value)
    return entries.length === 0 ? [pointer] : entries.flatMap(([key, item]) => leafPointers(item, `${pointer}/${escapePointer(key)}`))
  }
  return [pointer]
}

export const remainingEntries = (value: unknown, document: DisplayDocument): readonly FlatEntry[] => {
  const leaves = leafPointers(value)
  const represented = new Set<string>()
  for (const node of walkNodes(document.root)) {
    if (node.kind === "section" || node.kind === "list" || node.kind === "card") continue
    if (node.kind === "media") {
      for (const leaf of leaves) if (leaf === node.path || leaf.startsWith(`${node.path}/`) || node.path === "") represented.add(leaf)
      continue
    }
    if (typeof node.path === "string" && leaves.includes(node.path)) represented.add(node.path)
    for (const path of node.represented_paths ?? []) if (leaves.includes(path)) represented.add(path)
  }
  return flattenValue(value).filter((_entry, index) => !represented.has(leaves[index] ?? ""))
}
