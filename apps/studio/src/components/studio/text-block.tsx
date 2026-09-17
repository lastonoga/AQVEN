import { Fragment, type ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import type { TextLine, TextRun } from "@/domain"
import { TEXT_MARK, type TextMarkStyle } from "./presets"
import { textVariants } from "./text"

export type TextBlockVariant = "code" | "output" | "context" | "plain"

export type TextRunsProps = { readonly line: TextLine }

export type TextBlockProps = (
  | { readonly text: string; readonly lines?: never }
  | { readonly lines: readonly TextLine[]; readonly text?: never }
) & {
  readonly variant?: TextBlockVariant
  readonly muted?: boolean
  readonly clamp?: boolean
  readonly empty?: ReactNode
}

type TextBlockBodyProps = {
  readonly lines: readonly TextLine[]
  readonly className: string
}

const EMPTY_TEXT = "—"

const MARK_STYLE: Readonly<Record<TextMarkStyle, string>> = {
  chip: "rounded-xs bg-tone-bg px-1 py-px text-tone-fg",
  dashed: "rounded-xs border border-dashed border-tone-border px-1 text-tone-fg",
  ink: "text-tone-fg",
  code: "font-mono",
}

const textBlockVariants = cva("min-w-0", {
  variants: {
    variant: {
      code: textVariants({ role: "code" }),
      output: cn(textVariants({ role: "body" }), "leading-[1.6]"),
      context: textVariants({ role: "small" }),
      plain: textVariants({ role: "body" }),
    },
    muted: {
      true: "text-muted-foreground",
      false: "",
    },
    clamp: {
      true: "whitespace-pre-line",
      false: "",
    },
  },
  compoundVariants: [
    { variant: "output", clamp: true, class: "line-clamp-5" },
    { variant: "context", clamp: true, class: "line-clamp-3" },
  ],
  defaultVariants: {
    variant: "code",
    muted: false,
    clamp: false,
  },
})

function RunView({ run }: { readonly run: TextRun }) {
  if (typeof run === "string") return <>{run}</>
  const mark = TEXT_MARK[run.mark]
  return (
    <span data-tone={mark.tone} className={MARK_STYLE[mark.style]}>
      {run.text}
    </span>
  )
}

export function TextRuns({ line }: TextRunsProps) {
  return (
    <>
      {line.map((run, index) => (
        <RunView key={index} run={run} />
      ))}
    </>
  )
}

const toLines = (props: TextBlockProps): readonly TextLine[] => {
  if (props.text === undefined) return props.lines
  if (props.text.length === 0) return []
  return props.text.split("\n").map((text) => [text])
}

function BlockLines({ lines, className }: TextBlockBodyProps) {
  return (
    <div className={className}>
      {lines.map((line, index) => (
        <div key={index} className="min-h-lh">
          <TextRuns line={line} />
        </div>
      ))}
    </div>
  )
}

function ClampedLines({ lines, className }: TextBlockBodyProps) {
  return (
    <div className={className}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index === 0 ? null : "\n"}
          <TextRuns line={line} />
        </Fragment>
      ))}
    </div>
  )
}

export function TextBlock(props: TextBlockProps) {
  const { variant, muted, clamp = false, empty } = props
  const lines = toLines(props)
  const className = cn(textBlockVariants({ variant, muted, clamp }))
  if (lines.length === 0) return <div className={className}>{empty ?? EMPTY_TEXT}</div>
  const Body = clamp ? ClampedLines : BlockLines
  return <Body lines={lines} className={className} />
}
