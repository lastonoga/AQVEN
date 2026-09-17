import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import type { ContentPart, TextLine } from "@/domain"
import { Heading } from "./heading"
import { MediaPart } from "./media-part"
import { PropertyList, type PropertyListVariant, type PropertyRow } from "./property-list"
import { Surface } from "./surface"
import { TextBlock } from "./text-block"

type SectionBodyFields = {
  readonly properties: { readonly rows: readonly PropertyRow[]; readonly variant?: PropertyListVariant }
  readonly text: { readonly lines: readonly TextLine[]; readonly variant?: "code" | "plain" }
  readonly parts: { readonly parts: readonly ContentPart[] }
  readonly node: { readonly node: ReactNode }
}

export type SectionBodyKind = keyof SectionBodyFields

export type SectionBody<K extends SectionBodyKind = SectionBodyKind> = {
  [P in K]: { readonly kind: P } & SectionBodyFields[P]
}[K]

export type SectionSpec = {
  readonly id: string
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly count?: number
  readonly actions?: ReactNode
  readonly body: SectionBody
}

export type SectionStackProps = {
  readonly sections: readonly SectionSpec[]
  readonly gap?: "sm" | "base" | "md" | "lg"
  readonly columns?: 1 | 2
  readonly framed?: boolean
  readonly className?: string
}

type SectionBodyViews = { readonly [K in SectionBodyKind]: (body: SectionBody<K>) => ReactNode }

const SECTION_BODY: SectionBodyViews = {
  properties: (body) => (
    <Surface variant="panel" radius="lg" className="overflow-hidden">
      <PropertyList rows={body.rows} variant={body.variant ?? "split"} />
    </Surface>
  ),
  text: (body) => (
    <Surface variant="well" padding="sm">
      <TextBlock lines={body.lines} variant={body.variant ?? "code"} />
    </Surface>
  ),
  parts: (body) => (
    <div className="flex flex-col gap-2">
      {body.parts.map((part, index) => (
        <Surface key={`${part.name}-${String(index)}`} variant="panel" radius="lg" padding="sm">
          <MediaPart part={part} />
        </Surface>
      ))}
    </div>
  ),
  node: (body) => body.node,
}

const renderBody = <K extends SectionBodyKind>(body: SectionBody<K>): ReactNode => {
  const view: (body: SectionBody<K>) => ReactNode = SECTION_BODY[body.kind]
  return view(body)
}

const sectionStackVariants = cva("", {
  variants: {
    gap: {
      sm: "gap-2.5",
      base: "gap-3",
      md: "gap-3.5",
      lg: "gap-4",
    },
    columns: {
      1: "flex flex-col",
      2: "grid grid-cols-2",
    },
  },
  defaultVariants: {
    gap: "md",
    columns: 1,
  },
})

function SectionHeading({ section }: { readonly section: SectionSpec }) {
  return (
    <Heading size="label" id={section.id} title={section.title} description={section.hint ?? section.count} trailing={section.actions}>
      {renderBody(section.body)}
    </Heading>
  )
}

function SectionFrame({ section, framed }: { readonly section: SectionSpec; readonly framed: boolean }) {
  if (!framed) return <SectionHeading section={section} />
  return (
    <Surface variant="panel" padding="md">
      <SectionHeading section={section} />
    </Surface>
  )
}

export function SectionStack({ sections, gap, columns, framed = false, className }: SectionStackProps) {
  return (
    <div className={cn(sectionStackVariants({ gap, columns }), className)}>
      {sections.map((section) => (
        <SectionFrame key={section.id} section={section} framed={framed} />
      ))}
    </div>
  )
}
