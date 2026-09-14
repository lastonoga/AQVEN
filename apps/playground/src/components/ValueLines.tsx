import { MediaThumb } from "./MediaValue.js"
import { valueLines } from "./value-lines.js"
import { DATA_TEXT, MUTED_TEXT, TONE } from "./run-tokens.js"
import { isMediaKind, summarize } from "../values/index.js"
import type { ValueBlock } from "./value-lines.js"
import type { Ir } from "../api/index.js"

type Props = { value: unknown; typeName?: string; ir: Ir | null; lines: number }

const KEY_WIDTH = "9rem"

function Line({ label, text, tone }: { label: string; text: string; tone: string }) {
  if (label === "") return <div className={`${DATA_TEXT} ${TONE[tone] ?? TONE["data"]} break-words`}>{text}</div>
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={`${MUTED_TEXT} ${TONE["key"]} shrink-0 truncate`} style={{ width: KEY_WIDTH }}>
        {label}
      </span>
      <span className={`${DATA_TEXT} ${TONE[tone] ?? TONE["data"]} min-w-0 break-words`}>{text}</span>
    </div>
  )
}

function More({ block }: { block: ValueBlock }) {
  if (block.more === "") return null
  return <div className={`${MUTED_TEXT} ${TONE["muted"]} pt-0.5`}>{block.more}</div>
}

export function ValueLines({ value, typeName = "", ir, lines }: Props) {
  const summary = summarize(value, typeName, ir)

  if (summary.facts.media !== null && isMediaKind(summary.facts.kind)) {
    return (
      <div className="flex flex-col gap-1">
        <MediaThumb media={summary.facts.media} kind={summary.facts.kind} />
        <span className={`${MUTED_TEXT} ${TONE["muted"]}`}>{summary.detail}</span>
      </div>
    )
  }

  const block = valueLines(value, lines, typeName, ir)
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {block.lines.map((line, index) => (
        <Line key={`${line.key}:${index}`} label={line.key} text={line.text} tone={line.tone} />
      ))}
      <More block={block} />
    </div>
  )
}
