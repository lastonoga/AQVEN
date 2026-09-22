import { Fragment, type ReactNode } from "react"
import { cn } from "cn"
import { Check, X } from "lucide-react"
import { SEPARATOR } from "@/lib/format"
import type { Tone } from "./tone"

export type Span = {
  readonly text: string
  readonly tone?: Tone
  readonly strong?: boolean
  readonly mono?: boolean
  readonly glyph?: string
}

export type Inline = string | Span | readonly Span[]

export type RichProps = { readonly value: Inline }

export type MetaLineProps = { readonly parts: readonly ReactNode[]; readonly className?: string }

const GLYPH_ICON_CLASS = "size-3 shrink-0 self-center"

const GLYPH_ICON: ReadonlyMap<string, ReactNode> = new Map([
  ["check", <Check key="check" aria-hidden className={GLYPH_ICON_CLASS} />],
  ["cross", <X key="cross" aria-hidden className={GLYPH_ICON_CLASS} />],
])

const isSpanList = (value: Inline): value is readonly Span[] => Array.isArray(value)

export const checkGlyph = (pass: boolean): string => (pass ? "check" : "cross")

export const checkSpan = (pass: boolean, text: string): Span => ({
  glyph: checkGlyph(pass),
  tone: pass ? "success" : "destructive",
  text,
})

export const joinSpans = (spans: readonly Span[], tone?: Tone): readonly Span[] =>
  spans.flatMap((span, index) => {
    if (index === 0) return [span]
    const separator: Span = tone === undefined ? { text: SEPARATOR } : { text: SEPARATOR, tone }
    return [separator, span]
  })

export const hasContent = (node: ReactNode): boolean => node !== null && node !== undefined && node !== false && node !== ""

function Glyph({ glyph }: { readonly glyph: string }) {
  return GLYPH_ICON.get(glyph) ?? <span>{glyph}</span>
}

function GlyphText({ glyph, text }: { readonly glyph: string; readonly text: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <Glyph glyph={glyph} />
      <span>{text}</span>
    </span>
  )
}

const SATURATED_GLYPHS: ReadonlySet<string> = new Set(["check", "cross"])

const spanInk = (span: Span): string => {
  if (span.tone === undefined) return ""
  if (span.glyph !== undefined && SATURATED_GLYPHS.has(span.glyph)) return "text-tone"
  return "text-tone-fg"
}

const spanClass = (span: Span): string => cn(spanInk(span), span.strong === true && "font-semibold", span.mono === true && "font-mono")

function SpanView({ span }: { readonly span: Span }) {
  const content = span.glyph === undefined ? span.text : <GlyphText glyph={span.glyph} text={span.text} />
  return (
    <span data-tone={span.tone} className={spanClass(span)}>
      {content}
    </span>
  )
}

export function Rich({ value }: RichProps) {
  if (typeof value === "string") return <>{value}</>
  if (!isSpanList(value)) return <SpanView span={value} />
  return (
    <>
      {value.map((span, index) => (
        <SpanView key={index} span={span} />
      ))}
    </>
  )
}

export function MetaLine({ parts, className }: MetaLineProps) {
  const visible = parts.filter(hasContent)
  return (
    <span className={className}>
      {visible.map((part, index) => (
        <Fragment key={index}>
          {index === 0 ? null : <span aria-hidden>{SEPARATOR}</span>}
          {part}
        </Fragment>
      ))}
    </span>
  )
}
