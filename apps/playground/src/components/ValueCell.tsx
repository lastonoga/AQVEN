import type { ReactNode } from "react"
import { MediaThumb } from "./MediaValue.js"
import { isMediaKind, sizeLabel, summarize } from "../values/index.js"
import type { SummaryKind, ValueSummary } from "../values/index.js"
import type { Ir } from "../api/index.js"

const TONES: Readonly<Record<SummaryKind, string>> = {
  empty: "text-amber-500/80",
  text: "text-slate-200",
  number: "text-amber-200",
  boolean: "text-sky-200",
  object: "text-slate-200",
  array: "text-slate-200",
  enum: "text-sky-200",
  id: "text-slate-300",
  date: "text-slate-300",
  image: "text-slate-200",
  video: "text-slate-200",
  audio: "text-slate-200",
  file: "text-slate-200",
  link: "text-sky-300",
}

export const CELL_SIZE_LIMIT = 2048

export type ValueCellProps = {
  value: unknown
  typeName?: string
  ir?: Ir | null
  lines?: number
}

const CLAMP: Readonly<Record<number, string>> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
}

const noteOf = (summary: ValueSummary): string => {
  if (summary.missing.length > 0) return `не заполнено: ${summary.missing.join(", ")}`
  const size = summary.facts.bytes > CELL_SIZE_LIMIT ? sizeLabel(summary.facts.bytes) : ""
  return [summary.detail, size].filter((part) => part !== "").join(" · ")
}

function Detail({ summary }: { summary: ValueSummary }) {
  const note = noteOf(summary)
  if (note === "") return null
  const tone = summary.missing.length > 0 ? "text-amber-500/80" : "text-slate-500"
  return <span className={`block truncate font-mono text-[10.5px] ${tone}`}>{note}</span>
}

export function ValueCell({ value, typeName = "", ir = null, lines = 2 }: ValueCellProps): ReactNode {
  const summary = summarize(value, typeName, ir)

  if (summary.facts.media !== null && isMediaKind(summary.facts.kind)) {
    return (
      <span className="flex min-w-0 flex-col gap-0.5">
        <MediaThumb media={summary.facts.media} kind={summary.facts.kind} />
        <Detail summary={summary} />
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={`block font-mono text-[12px] leading-[1.35] ${CLAMP[lines] ?? CLAMP[2]} ${TONES[summary.kind]}`}>
        {summary.text}
      </span>
      <Detail summary={summary} />
    </span>
  )
}
