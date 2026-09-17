import { createElement, type ComponentProps } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import type { Tone } from "./tone"

export type TextRole =
  | "display"
  | "page"
  | "section"
  | "block"
  | "entity"
  | "item"
  | "cell"
  | "tiny"
  | "body"
  | "code"
  | "small"
  | "prose"
  | "meta"
  | "hint"
  | "caption"
  | "micro"
  | "label"
  | "column"
  | "row"
  | "link"
  | "crumb"
  | "lead"
  | "note"
  | "data"
  | "command"
  | "entry"
  | "menu"
export type TextTone = "inherit" | "default" | "faint" | Tone
export type TextWeight = "normal" | "medium" | "semibold" | "bold"
export type TextElement = "span" | "div" | "p" | "h1" | "h2" | "h3" | "h4" | "dt" | "dd"

export type TextProps = Omit<ComponentProps<"span">, "color" | "role"> & {
  readonly role: TextRole
  readonly tone?: TextTone
  readonly weight?: TextWeight
  readonly truncate?: boolean
  readonly verbatim?: boolean
  readonly accent?: boolean
  readonly as?: TextElement
  readonly asChild?: boolean
}

export type TextVariantOptions = {
  readonly role: TextRole
  readonly tone?: TextTone | undefined
  readonly weight?: TextWeight | undefined
  readonly truncate?: boolean | undefined
  readonly verbatim?: boolean | undefined
  readonly accent?: boolean | undefined
}

const textRecipe = cva("", {
  variants: {
    role: {
      display: "font-mono text-3xl leading-[1.1] tracking-[-0.01em]",
      page: "font-sans text-2xl leading-[1.2]",
      section: "font-sans text-xl leading-[1.2]",
      block: "font-sans text-base leading-none",
      entity: "font-mono text-lg leading-[1.2]",
      item: "font-mono text-md leading-none",
      cell: "font-mono text-xs leading-[1.4]",
      tiny: "font-mono text-3xs leading-none",
      body: "font-mono text-2xs leading-[1.55] wrap-anywhere",
      code: "font-mono text-2xs leading-[1.7] whitespace-pre-wrap wrap-anywhere",
      small: "font-mono text-4xs leading-[1.5]",
      prose: "font-sans text-md leading-[1.6]",
      meta: "font-sans text-sm leading-[1.4]",
      hint: "font-sans text-xs leading-[1.4]",
      caption: "font-sans text-3xs leading-[1.45]",
      micro: "font-sans text-4xs leading-none",
      label: "font-sans text-2xs font-medium uppercase tracking-[.04em] leading-none",
      column: "font-sans text-3xs font-medium uppercase leading-[1.3]",
      row: "font-sans text-xs font-medium uppercase leading-[1.35]",
      link: "font-sans text-2xs font-medium underline underline-offset-3",
      crumb: "font-sans text-sm leading-none underline underline-offset-3",
      lead: "font-sans text-md leading-normal",
      note: "font-sans text-xs leading-[1.6]",
      data: "font-mono text-3xs leading-[1.55] wrap-anywhere",
      command: "font-mono text-2xs leading-none",
      entry: "font-mono text-sm leading-none",
      menu: "font-sans text-3xs leading-none",
    },
    ink: {
      inherit: "",
      default: "text-foreground",
      faint: "text-ring",
      tone: "text-tone-fg",
      accent: "text-tone",
    },
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    truncate: {
      true: "min-w-0 truncate",
      false: "",
    },
    verbatim: {
      true: "normal-case tracking-normal",
      false: "",
    },
  },
})

export const emphasisVariants = cva("", {
  variants: {
    weight: {
      normal: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    verbatim: {
      true: "normal-case tracking-normal",
      false: "",
    },
    mono: {
      true: "font-mono",
      false: "",
    },
  },
})

type PlainTone = Exclude<TextTone, Tone>

const PLAIN_TONES: ReadonlySet<TextTone> = new Set<PlainTone>(["inherit", "default", "faint"])

const isTone = (tone: TextTone): tone is Tone => !PLAIN_TONES.has(tone)

const textTone = (tone: TextTone): Tone | undefined => (isTone(tone) ? tone : undefined)

const toneInk = (accent: boolean): "tone" | "accent" => (accent ? "accent" : "tone")

export const textVariants = ({ role, tone = "inherit", weight, truncate, verbatim, accent = false }: TextVariantOptions): string =>
  textRecipe({ role, ink: isTone(tone) ? toneInk(accent) : tone, weight, truncate, verbatim })

export function Text({
  role,
  tone = "inherit",
  weight,
  truncate = false,
  verbatim = false,
  accent = false,
  as = "span",
  asChild = false,
  className,
  ...rest
}: TextProps) {
  const props = {
    "data-tone": textTone(tone),
    className: cn(textVariants({ role, tone, weight, truncate, verbatim, accent }), className),
    ...rest,
  }
  if (asChild) return <Slot.Root {...props} />
  return createElement(as, props)
}
