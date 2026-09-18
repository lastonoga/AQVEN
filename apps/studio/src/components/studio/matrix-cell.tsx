import type { ReactNode } from "react"
import { Ellipsis } from "lucide-react"
import type { ContentPart, Provenance, TextLine } from "./presets"
import { Dot } from "./dot"
import { Expander } from "./expander"
import { Heading } from "./heading"
import { MediaPart } from "./media-part"
import { PROVENANCE } from "./presets"
import { Rich, type Inline } from "./rich"
import { Stat } from "./stat"
import { Tag, type TagSpec } from "./tag"
import { Text } from "./text"
import { TextBlock } from "./text-block"
import { StructuredValue } from "./value-display"
import type { OutputMedia } from "./media-output"
import type { Tone } from "./tone"

export type ExpanderSpec = {
  readonly label: string
  readonly ariaLabel: string
  readonly open: boolean
  readonly controls: string
  readonly onToggle: () => void
}

export type CellDotShape = "round" | "square"

type CellBlockFields = {
  readonly heading: {
    readonly title: Inline
    readonly subtitle?: Inline
    readonly size: "item" | "cell" | "tiny"
    readonly dots?: readonly Tone[]
    readonly dotShape?: CellDotShape
    readonly tags?: readonly TagSpec[]
    readonly menu?: boolean
    readonly expander?: ExpanderSpec
  }
  readonly text: {
    readonly lines: readonly TextLine[]
    readonly variant: "context" | "output" | "plain"
    readonly muted?: boolean
    readonly clamp?: boolean
  }
  readonly value: { readonly value: unknown; readonly media?: readonly OutputMedia[]; readonly mediaOnly?: boolean }
  readonly inline: {
    readonly lines: readonly Inline[]
    readonly role: "body" | "small" | "caption" | "tiny" | "link"
    readonly tone?: "default" | Tone
  }
  readonly refs: {
    readonly items: readonly { readonly provenance: Provenance; readonly text: string }[]
    readonly text?: Inline
    readonly link?: string
  }
  readonly parts: { readonly parts: readonly ContentPart[] }
  readonly meter: {
    readonly value: Inline
    readonly trail?: Inline
    readonly bar?: { readonly value: number; readonly tone: Tone }
  }
  readonly tags: { readonly tags: readonly TagSpec[]; readonly text?: Inline }
  readonly divider: object
  readonly node: { readonly node: ReactNode }
}

export type CellBlockKind = keyof CellBlockFields

export type CellBlock<K extends CellBlockKind = CellBlockKind> = {
  [P in K]: { readonly kind: P } & CellBlockFields[P]
}[K]

export type MatrixCellProps = { readonly blocks: readonly CellBlock[] }

type CellBlockViews = { readonly [K in CellBlockKind]: (block: CellBlock<K>) => ReactNode }

const EMPTY_CELL = "—"

const DOT_SIZE = { round: "sm", square: "md" } as const

function CellDots({ dots, shape }: { readonly dots: readonly Tone[]; readonly shape: CellDotShape }) {
  if (dots.length === 0) return null
  return (
    <span className="flex shrink-0 gap-1">
      {dots.map((tone, index) => (
        <Dot key={index} tone={tone} shape={shape} size={DOT_SIZE[shape]} />
      ))}
    </span>
  )
}

function CellExpander({ expander }: { readonly expander: ExpanderSpec | undefined }) {
  if (expander === undefined) return null
  return (
    <Expander
      open={expander.open}
      label={expander.label}
      aria-label={expander.ariaLabel}
      controls={expander.controls}
      onClick={expander.onToggle}
      className="mt-0.5 self-start"
    />
  )
}

function MenuMark() {
  return (
    <span aria-hidden className="inline-flex h-5.5 items-center">
      <Ellipsis className="size-4 text-ring" />
    </span>
  )
}

function HeadingSubtitle({ subtitle }: { readonly subtitle: Inline | undefined }) {
  if (subtitle === undefined) return null
  return (
    <Text as="div" role="caption" tone="neutral">
      <Rich value={subtitle} />
    </Text>
  )
}

function HeadingBlock({ title, subtitle, size, dots = [], dotShape = "round", tags = [], menu = false, expander }: CellBlock<"heading">) {
  return (
    <>
      <Heading
        size={size}
        titleAs="div"
        leading={<CellDots dots={dots} shape={dotShape} />}
        title={<Rich value={title} />}
        tags={tags.map((tag) => ({ fill: "tint", size: "micro", ...tag }))}
        trailing={menu ? <MenuMark /> : null}
      />
      <HeadingSubtitle subtitle={subtitle} />
      <CellExpander expander={expander} />
    </>
  )
}

function TrailingText({ text }: { readonly text: Inline | undefined }) {
  if (text === undefined) return null
  return (
    <Text role="small" tone="neutral">
      <Rich value={text} />
    </Text>
  )
}

function MeterBlock({ kind, value, trail, ...bar }: CellBlock<"meter">) {
  return <Stat variant="meter" value={<Rich value={value} />} trail={trail === undefined ? null : <Rich value={trail} />} {...bar} />
}

const BLOCK_VIEW: CellBlockViews = {
  heading: HeadingBlock,
  text: ({ lines, variant, muted = false, clamp = false }) => (
    <TextBlock lines={lines} variant={variant} muted={muted} clamp={clamp} />
  ),
  value: ({ value, media, mediaOnly }) => <StructuredValue value={value} media={media} mediaOnly={mediaOnly} compact />,
  inline: ({ lines, role, tone }) => (
    <div className="min-w-0">
      {lines.map((line, index) => (
        <Text key={index} as="div" role={role} tone={tone ?? "inherit"}>
          <Rich value={line} />
        </Text>
      ))}
    </div>
  ),
  refs: ({ items, text, link }) => (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((ref, index) => {
        const spec = PROVENANCE[ref.provenance]
        return (
          <Tag
            key={`${ref.text}-${String(index)}`}
            size="ref"
            fill="stroke"
            tone={spec.tone}
            shape={spec.shape}
            dashed={spec.dashed}
            leading={spec.glyph}
          >
            {ref.text}
          </Tag>
        )
      })}
      <TrailingText text={text} />
      {link === undefined ? null : (
        <Text role="link" tone="default">
          {link}
        </Text>
      )}
    </div>
  ),
  parts: ({ parts }) => (
    <div className="flex flex-col gap-2.25">
      {parts.map((part, index) => (
        <MediaPart key={`${part.name}-${String(index)}`} part={part} compact />
      ))}
    </div>
  ),
  meter: MeterBlock,
  tags: ({ tags, text }) => (
    <div className="flex flex-wrap items-center gap-1.25">
      {tags.map((tag, index) => (
        <Tag key={`${tag.children}-${String(index)}`} {...tag} />
      ))}
      <TrailingText text={text} />
    </div>
  ),
  divider: () => <div aria-hidden className="mt-0.5 border-t border-border" />,
  node: ({ node }) => node,
}

const renderBlock = <K extends CellBlockKind>(block: CellBlock<K>): ReactNode => {
  const view: (block: CellBlock<K>) => ReactNode = BLOCK_VIEW[block.kind]
  return view(block)
}

function BlockSlot({ block }: { readonly block: CellBlock }) {
  return <>{renderBlock(block)}</>
}

function EmptyCell() {
  return (
    <Text as="div" role="small" tone="neutral">
      {EMPTY_CELL}
    </Text>
  )
}

export function MatrixCell({ blocks }: MatrixCellProps) {
  if (blocks.length === 0) return <EmptyCell />
  return (
    <div className="flex min-w-0 flex-col gap-1.25">
      {blocks.map((block, index) => (
        <BlockSlot key={index} block={block} />
      ))}
    </div>
  )
}
