import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { hasContent } from "./rich"
import { Tag, type TagFill, type TagSize, type TagSpec } from "./tag"
import { Text, type TextRole, type TextTone, type TextWeight } from "./text"

export type HeadingSize = "page" | "section" | "block" | "entity" | "item" | "cell" | "tiny" | "label"
export type HeadingElement = "h1" | "h2" | "h3" | "h4" | "div"

export type HeadingProps = {
  readonly size: HeadingSize
  readonly title: ReactNode
  readonly leading?: ReactNode
  readonly tags?: readonly TagSpec[]
  readonly description?: ReactNode
  readonly trailing?: ReactNode
  readonly below?: readonly ReactNode[]
  readonly wrap?: boolean
  readonly titleAs?: HeadingElement
  readonly id?: string
  readonly className?: string
  readonly children?: ReactNode
}

type TextStyle = {
  readonly role: TextRole
  readonly tone?: TextTone
  readonly weight?: TextWeight
  readonly truncate?: boolean
}

type TrailingPlacement = "row" | "head" | "stacked"

type HeadingSizeSpec = {
  readonly title: TextStyle & { readonly as: HeadingElement }
  readonly tag: { readonly size: TagSize; readonly fill?: TagFill }
  readonly layout: "line" | "label"
  readonly description: TextStyle
  readonly count?: TextStyle
  readonly below: TextRole
  readonly belowGap: string
  readonly trailingPlacement: TrailingPlacement
  readonly body: string
}

type HeadingRowProps = Omit<HeadingProps, "below" | "children" | "id" | "className"> & {
  readonly id?: string | undefined
  readonly className?: string | undefined
}

type HeadingHeadProps = Omit<HeadingProps, "children" | "id" | "className"> & {
  readonly id?: string | undefined
  readonly className?: string | undefined
}

const describe = (role: TextRole): TextStyle => ({ role, tone: "neutral", truncate: true })

const HEADING_SIZE: Readonly<Record<HeadingSize, HeadingSizeSpec>> = {
  page: {
    title: { role: "page", weight: "semibold", as: "h1" },
    tag: { size: "sm" },
    layout: "line",
    description: describe("meta"),
    below: "lead",
    belowGap: "mt-1.5",
    trailingPlacement: "head",
    body: "mt-4",
  },
  section: {
    title: { role: "section", weight: "semibold", as: "h2" },
    tag: { size: "sm" },
    layout: "line",
    description: describe("meta"),
    below: "prose",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-3",
  },
  block: {
    title: { role: "block", weight: "semibold", as: "h3" },
    tag: { size: "micro", fill: "tint" },
    layout: "line",
    description: describe("caption"),
    below: "caption",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-1.75",
  },
  entity: {
    title: { role: "entity", weight: "semibold", as: "h2" },
    tag: { size: "md" },
    layout: "line",
    description: describe("meta"),
    below: "cell",
    belowGap: "mt-0.75",
    trailingPlacement: "stacked",
    body: "mt-3",
  },
  item: {
    title: { role: "item", weight: "semibold", as: "h3", truncate: true },
    tag: { size: "sm" },
    layout: "line",
    description: describe("caption"),
    below: "cell",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-2.25",
  },
  cell: {
    title: { role: "cell", weight: "semibold", as: "div", truncate: true },
    tag: { size: "micro", fill: "tint" },
    layout: "line",
    description: describe("caption"),
    below: "small",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-1.5",
  },
  tiny: {
    title: { role: "tiny", weight: "medium", as: "div", truncate: true },
    tag: { size: "micro" },
    layout: "line",
    description: describe("caption"),
    below: "small",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-1.5",
  },
  label: {
    title: { role: "label", tone: "neutral", as: "h3" },
    tag: { size: "sm" },
    layout: "label",
    description: describe("hint"),
    count: { role: "small", tone: "default", weight: "semibold" },
    below: "hint",
    belowGap: "mt-1.5",
    trailingPlacement: "row",
    body: "mt-2",
  },
}

const headingRowVariants = cva("flex min-w-0", {
  variants: {
    layout: {
      line: "items-center gap-2",
      label: "flex-wrap items-baseline gap-x-2.25 gap-y-1",
    },
    wrap: {
      true: "flex-wrap",
      false: "",
    },
  },
})

const TRAILING_IN_HEAD: Readonly<Record<TrailingPlacement, (belowCount: number) => boolean>> = {
  row: () => false,
  head: () => true,
  stacked: (belowCount) => belowCount > 0,
}

const NEXT_BELOW_GAP = "mt-1.25"

const belowGap = (index: number, first: string): string => (index === 0 ? first : NEXT_BELOW_GAP)

function HeadingDescription({ spec, description }: { readonly spec: HeadingSizeSpec; readonly description: ReactNode }) {
  if (!hasContent(description)) return null
  const style = typeof description === "number" ? (spec.count ?? spec.description) : spec.description
  return <Text {...style}>{description}</Text>
}

function HeadingRow({ size, title, leading, tags = [], description, trailing, wrap = false, titleAs, id, className }: HeadingRowProps) {
  const spec = HEADING_SIZE[size]
  const { as, ...titleStyle } = spec.title
  return (
    <div id={id} className={cn(headingRowVariants({ layout: spec.layout, wrap }), className)}>
      {leading}
      <Text {...titleStyle} as={titleAs ?? as}>
        {title}
      </Text>
      {tags.map((tag) => (
        <Tag key={tag.children} {...spec.tag} {...tag} />
      ))}
      <HeadingDescription spec={spec} description={description} />
      {hasContent(trailing) ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  )
}

function HeadingBelow({ lines, spec }: { readonly lines: readonly ReactNode[]; readonly spec: HeadingSizeSpec }) {
  return lines.map((line, index) => (
    <Text key={index} as="div" role={spec.below} tone="neutral" className={belowGap(index, spec.belowGap)}>
      {line}
    </Text>
  ))
}

function SplitHead({ below = [], id, className, trailing, ...row }: HeadingHeadProps) {
  return (
    <div id={id} className={cn("flex min-w-0 items-start gap-2.5", className)}>
      <div className="min-w-0 flex-1">
        <HeadingRow {...row} />
        <HeadingBelow lines={below} spec={HEADING_SIZE[row.size]} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div>
    </div>
  )
}

function HeadingHead(props: HeadingHeadProps) {
  const { below = [], id, className, ...row } = props
  const spec = HEADING_SIZE[row.size]
  if (hasContent(row.trailing) && TRAILING_IN_HEAD[spec.trailingPlacement](below.length)) return <SplitHead {...props} />
  if (below.length === 0) return <HeadingRow {...row} id={id} className={className} />
  return (
    <div id={id} className={cn("min-w-0", className)}>
      <HeadingRow {...row} />
      <HeadingBelow lines={below} spec={spec} />
    </div>
  )
}

export function Heading({ children, id, className, ...head }: HeadingProps) {
  if (children === undefined) return <HeadingHead {...head} id={id} className={className} />
  return (
    <section id={id} className={className}>
      <HeadingHead {...head} />
      <div className={HEADING_SIZE[head.size].body}>{children}</div>
    </section>
  )
}
