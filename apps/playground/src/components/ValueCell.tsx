import type { ReactNode } from "react"
import { MediaThumb } from "./MediaValue.js"
import { NO_HINT, factsOf, isMediaKind, sizeLabel, summaryOf } from "../values/index.js"
import type { ValueFacts, ValueHint, ValueKind } from "../values/index.js"

export const CELL_SIZE_LIMIT = 2048

const TONES: Readonly<Record<ValueKind, string>> = {
  empty: "text-slate-600",
  text: "text-slate-300",
  number: "text-amber-300",
  boolean: "text-sky-300",
  object: "text-slate-400",
  array: "text-slate-400",
  image: "text-slate-300",
  video: "text-slate-300",
  audio: "text-slate-300",
  file: "text-slate-300",
  link: "text-sky-300",
}

export type ValueCellProps = { value: unknown; hint?: ValueHint }

const sizeNote = (facts: ValueFacts): string => (facts.bytes > CELL_SIZE_LIMIT ? sizeLabel(facts.bytes) : "")

export function ValueCell({ value, hint = NO_HINT }: ValueCellProps): ReactNode {
  const facts = factsOf(value, hint)

  if (facts.media !== null && isMediaKind(facts.kind)) {
    return (
      <span className="flex min-w-0 items-center" title={summaryOf(facts)}>
        <MediaThumb media={facts.media} kind={facts.kind} />
      </span>
    )
  }

  const note = sizeNote(facts)
  return (
    <span className="flex min-w-0 items-baseline gap-1.5" title={summaryOf(facts)}>
      <span className={`truncate font-mono text-[11.5px] ${TONES[facts.kind]}`}>{summaryOf(facts)}</span>
      {note !== "" && <span className="shrink-0 font-mono text-[10px] text-slate-600">{note}</span>}
    </span>
  )
}
