import type { FilePath } from "@/domain"
import { flattenValueWithMedia, type MediaFileLocator } from "@/components/studio"
import * as ids from "@/data/ids"

export type AttachTarget = {
  readonly field: string
  readonly location: string
  readonly accept: string | undefined
  readonly filled: boolean
}

type SchemaNode = Readonly<Record<string, unknown>>
type Segments = readonly string[]

const ROOT_PREFIX = "@root/"
const ENGINE_STATE_FOLDER = ".aqven"
const PARENT = ".."
const CURRENT = "."
const SLASH = "/"
const BACKSLASH = /\\/gu
const ABSOLUTE = /^(\/|[A-Za-z]:)/u
const INPUTS_PART = "inputs"
const MEDIA_KEY = "$media"
const MEDIA_FAMILY = /^\^?\(?(image|audio|video)\//u
const BROWSABLE_FAMILIES: ReadonlySet<string> = new Set(["image", "audio", "video"])

const isRecord = (value: unknown): value is SchemaNode => typeof value === "object" && value !== null && !Array.isArray(value)

const stepInto = (kept: Segments | null, part: string): Segments | null => {
  if (kept === null) return null
  if (part === "" || part === CURRENT) return kept
  if (part !== PARENT) return [...kept, part]
  return kept.length === 0 ? null : kept.slice(0, -1)
}

const normalized = (path: string): Segments | null => path.split(SLASH).reduce<Segments | null>(stepInto, [])

const folderSegments = (folder: string): Segments => folder.split(SLASH).filter((part) => part.length > 0)

export const mediaFilePath = (file: string, mediaFolder: string): FilePath | null => {
  const reference = file.replace(BACKSLASH, SLASH)
  const rooted = reference.startsWith(ROOT_PREFIX)
  const rest = rooted ? reference.slice(ROOT_PREFIX.length) : reference
  if (rest.trim().length === 0 || ABSOLUTE.test(rest)) return null
  const relative = normalized(rest)
  if (relative === null || relative.length === 0) return null
  const joined = [...(rooted ? [] : folderSegments(mediaFolder)), ...relative]
  if (joined[0]?.toLowerCase() === ENGINE_STATE_FOLDER) return null
  return ids.filePath(joined.join(SLASH))
}

export const mediaFileLocator = (mediaFolder: string): MediaFileLocator => (file) => mediaFilePath(file, mediaFolder)

const familyAccept = (family: string | undefined): string | undefined =>
  family !== undefined && BROWSABLE_FAMILIES.has(family) ? `${family}/*` : undefined

const variantsOf = (schema: unknown): readonly SchemaNode[] => {
  if (!isRecord(schema)) return []
  const variants = schema["anyOf"] ?? schema["oneOf"]
  return Array.isArray(variants) ? variants.filter(isRecord) : [schema]
}

const propertiesOf = (schema: unknown): readonly (readonly [string, unknown])[] =>
  variantsOf(schema).flatMap((variant) => (isRecord(variant["properties"]) ? Object.entries(variant["properties"]) : []))

const mediaSchemaOf = (schema: unknown): SchemaNode | undefined =>
  variantsOf(schema).map((variant) => variant["properties"]).filter(isRecord).map((properties) => properties[MEDIA_KEY]).find(isRecord)

const patternAccept = (media: SchemaNode): string | undefined => {
  const pattern = media["pattern"]
  return typeof pattern === "string" ? familyAccept(MEDIA_FAMILY.exec(pattern)?.[1]) : undefined
}

const target = (field: string, accept: string | undefined, filled: boolean): AttachTarget => ({
  field,
  location: `${INPUTS_PART}.${field}`,
  accept,
  filled,
})

const schemaTargets = (inputSchema: unknown): readonly AttachTarget[] =>
  propertiesOf(inputSchema).flatMap(([name, schema]) => {
    const media = mediaSchemaOf(schema)
    return media === undefined ? [] : [target(name, patternAccept(media), false)]
  })

const valueTargets = (inputs: unknown): readonly AttachTarget[] =>
  flattenValueWithMedia(inputs).flatMap((entry) =>
    "media" in entry ? [target(entry.path, familyAccept(entry.media.mediaType.split(SLASH)[0]), true)] : [])

export const attachTargets = (inputs: unknown, inputSchema: unknown): readonly AttachTarget[] => {
  if (!isRecord(inputs)) return []
  const filled = new Map(valueTargets(inputs).map((item) => [item.field, item]))
  const declared = schemaTargets(inputSchema).map((item) => (filled.has(item.field) ? { ...item, filled: true } : item))
  const known = new Set(declared.map((item) => item.field))
  return [...declared, ...[...filled.values()].filter((item) => !known.has(item.field))]
}
