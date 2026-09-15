import { MediaThumb } from "./MediaValue.js"
import { valueLines } from "./value-lines.js"
import { MUTED_TEXT, TONE } from "./run-tokens.js"
import { isMediaKind, summarize } from "../values/index.js"
import type { ValueBlock } from "./value-lines.js"
import type { Ir } from "../api/index.js"

type Props = { value: unknown; typeName?: string; ir: Ir | null; lines: number; chars?: number }

function More({ block }: { block: ValueBlock }) {
  if (block.more === "") return null
  return <div className={`${MUTED_TEXT} ${TONE["muted"]} truncate pt-0.5`}>{block.more}</div>
}

export function ValueLines({ value, typeName = "", ir, lines, chars }: Props) {
  const summary = summarize(value, typeName, ir)

  if (summary.facts.media !== null && isMediaKind(summary.facts.kind)) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <MediaThumb media={summary.facts.media} kind={summary.facts.kind} />
        <span className={`${MUTED_TEXT} ${TONE["muted"]} truncate`}>{summary.detail}</span>
      </div>
    )
  }

  const block = valueLines(value, lines, typeName, ir, chars)
  return (
    <div className="flex min-w-0 flex-col">
      {block.lines.map((line, index) => (
        <div
          key={`${line.key}:${index}`}
          className="flex min-w-0 items-baseline gap-1.5 font-mono text-[12.5px] leading-[1.45]"
        >
          {line.key !== "" && <span className={`shrink-0 ${TONE["muted"]}`}>{line.key}</span>}
          <span className={`min-w-0 flex-1 truncate ${TONE[line.tone] ?? TONE["data"]}`}>{line.text}</span>
        </div>
      ))}
      <More block={block} />
    </div>
  )
}
