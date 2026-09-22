import { useTranslations } from "use-intl"
import { Separator } from "@/components/ui/separator"
import { FlatEntries, StructuredValue, Surface, Tag, Text, type TextTone } from "@/components/studio"
import { MediaOutput, type OutputMedia } from "@/components/studio/media-output"
import { mediaAt, remainingEntries, renderableDocument, resolvePointer, type DisplayNode, type DisplayTone } from "./presentation-data"

type Props = {
  readonly value: unknown
  readonly document: unknown
  readonly compact?: boolean
  readonly media?: readonly OutputMedia[]
  readonly mediaOnly?: boolean
  readonly example?: boolean
}

type NodeProps = {
  readonly node: DisplayNode
  readonly value: unknown
  readonly media: readonly OutputMedia[]
  readonly mediaOnly: boolean
  readonly compact: boolean
  readonly example: boolean
  readonly depth: number
}

const tone = (value: DisplayTone | undefined) => value === "positive" ? "success" : value === "critical" ? "destructive" : value ?? "neutral"
const textTone = (value: DisplayTone | undefined): TextTone => value === undefined || value === "neutral" ? "default" : tone(value)
const textValue = (value: unknown): string =>
  typeof value === "string" ? value : value === null ? "null" : typeof value === "object" ? JSON.stringify(value) :
    typeof value === "number" || typeof value === "boolean" ? String(value) : ""

function DisplayHeading({ title, depth }: { readonly title: string | undefined; readonly depth: number }) {
  if (title === undefined || title.length === 0) return null
  if (depth === 0) return <Text as="h4" role="hint" tone="default" weight="semibold">{title}</Text>
  if (depth === 1) return <Text asChild role="hint" tone="default" weight="semibold"><h5>{title}</h5></Text>
  return <Text asChild role="hint" tone="default" weight="semibold"><h6>{title}</h6></Text>
}

function SectionView({ title, children, value, media, mediaOnly, compact, example, depth }: Omit<NodeProps, "node"> & {
  readonly title: string | undefined
  readonly children: readonly DisplayNode[]
}) {
  return (
    <section className="min-w-0 space-y-2">
      <DisplayHeading title={title} depth={depth} />
      {children.map((child, index) => <Node key={index} node={child} value={value} media={media} mediaOnly={mediaOnly} compact={compact} example={example} depth={depth + 1} />)}
    </section>
  )
}

function ListView({ title, children, value, media, mediaOnly, compact, example, depth }: Omit<NodeProps, "node"> & {
  readonly title: string | undefined
  readonly children: readonly DisplayNode[]
}) {
  return (
    <div className="min-w-0 space-y-1">
      <DisplayHeading title={title} depth={depth} />
      <ul className="min-w-0 list-disc space-y-1 pl-4">
        {children.map((child, index) => <li key={index} className="min-w-0"><Node node={child} value={value} media={media} mediaOnly={mediaOnly} compact={compact} example={example} depth={depth + 1} /></li>)}
      </ul>
    </div>
  )
}

function CardView({ title, description, cardTone, children, value, media, mediaOnly, compact, example, depth }: Omit<NodeProps, "node"> & {
  readonly title: string
  readonly description: string | null | undefined
  readonly cardTone: DisplayTone | undefined
  readonly children: readonly DisplayNode[]
}) {
  return (
    <Surface asChild variant={cardTone === undefined || cardTone === "neutral" ? "panel" : "tinted"}
      padding={compact ? "xs" : "sm"} tone={tone(cardTone)} className="min-w-0 space-y-2">
      <article>
        <DisplayHeading title={title} depth={depth} />
        {description ? <Text as="p" role="note" tone="faint" className="min-w-0 whitespace-pre-wrap wrap-anywhere">{description}</Text> : null}
        {children.map((child, index) => <Node key={index} node={child} value={value} media={media} mediaOnly={mediaOnly} compact={compact} example={example} depth={depth + 1} />)}
      </article>
    </Surface>
  )
}

function TextView({ content, valueTone }: { readonly content: string; readonly valueTone: DisplayTone | undefined }) {
  return <Text as="p" role="note" tone={textTone(valueTone)} className="min-w-0 whitespace-pre-wrap wrap-anywhere">{content}</Text>
}

function FieldView({ label, content, valueTone }: { readonly label: string; readonly content: string; readonly valueTone: DisplayTone | undefined }) {
  return (
    <dl className="min-w-0">
      <Text as="dt" role="hint" tone="neutral" weight="medium">{label}</Text>
      <Text as="dd" role="note" tone={textTone(valueTone)} className="m-0 min-w-0 whitespace-pre-wrap wrap-anywhere">{content}</Text>
    </dl>
  )
}

function BadgeView({ content, valueTone }: { readonly content: string; readonly valueTone: DisplayTone | undefined }) {
  return <Tag tone={tone(valueTone)} fill="tint" size="sm" wrap>{content}</Tag>
}

function MediaView({ value, path, alt, media, mediaOnly, compact, example }: Pick<NodeProps, "value" | "media" | "mediaOnly" | "compact" | "example"> & {
  readonly path: string
  readonly alt: string | undefined
}) {
  const t = useTranslations("runs.presentation")
  if (example) return <div role="img" aria-label={alt ?? t("exampleMedia")} className="flex min-h-28 min-w-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
    {alt ?? t("exampleMedia")}
  </div>
  const item = mediaAt(value, path, alt, media, mediaOnly)
  return item === null ? null : <MediaOutput media={item} compact={compact} />
}

const scalarContent = (node: { readonly path?: string; readonly value?: unknown }, value: unknown): string => {
  const resolved = typeof node.path === "string" ? resolvePointer(value, node.path) : { found: true, value: node.value }
  return textValue(resolved.found ? resolved.value : "")
}

function Node({ node, value, media, mediaOnly, compact, example, depth }: NodeProps) {
  const shared = { value, media, mediaOnly, compact, example, depth }
  if (node.kind === "section") return <SectionView title={node.title} children={node.children} {...shared} />
  if (node.kind === "list") return <ListView title={node.title} children={node.children} {...shared} />
  if (node.kind === "card") return <CardView title={node.title} description={node.description} cardTone={node.tone} children={node.children} {...shared} />
  if (node.kind === "media") return <MediaView path={node.path} alt={node.alt} {...shared} />
  if (node.kind === "text") return <TextView content={scalarContent(node, value)} valueTone={node.tone} />
  if (node.kind === "field") return <FieldView label={node.label} content={scalarContent(node, value)} valueTone={node.tone} />
  return <BadgeView content={scalarContent(node, value)} valueTone={node.tone} />
}

export function FormattedDocument({ value, document: rawDocument, compact = false, media = [], mediaOnly = false, example = false }: Props) {
  const t = useTranslations("runs.presentation")
  const document = renderableDocument(rawDocument, value, media, mediaOnly, example)
  if (document === null) {
    return <StructuredValue value={value} media={media} mediaOnly={mediaOnly} compact={compact} />
  }
  const additional = example ? [] : remainingEntries(value, document)
  return (
    <div className="min-w-0 space-y-3" data-presentation="formatted">
      <Node node={document.root} value={value} media={media} mediaOnly={mediaOnly} compact={compact} example={example} depth={0} />
      {additional.length === 0 ? null : (
        <section className="min-w-0">
          <Separator decorative className="mb-2" />
          <Text as="h4" role="caption" tone="neutral" weight="medium" className="mb-1">{t("additionalData")}</Text>
          <FlatEntries entries={additional} />
        </section>
      )}
    </div>
  )
}
