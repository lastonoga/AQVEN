import { valueLines } from "../components/value-lines.js"
import { LEVEL_STYLE } from "./zoom-level.js"
import type { ZoomLevel } from "./zoom-level.js"
import type { LineTone } from "../components/value-lines.js"

const TONE: Readonly<Record<LineTone, string>> = {
  data: "text-[#E6EAF0]",
  muted: "text-[#7C8CA3]",
  number: "text-[#F5B871]",
  link: "text-[#7FC4FF]",
  error: "text-[#FF9E8A]",
  ok: "text-[#8BE0B0]",
}

export type ZoneBudget = { input: number; prompt: number; output: number }

export const BUDGET: Readonly<Record<ZoomLevel, ZoneBudget>> = {
  0: { input: 0, prompt: 0, output: 0 },
  1: { input: 0, prompt: 0, output: 1 },
  2: { input: 3, prompt: 3, output: 5 },
  3: { input: 4, prompt: 4, output: 7 },
}

const LABEL_WIDTH = "2.9rem"

type Props = {
  label: string
  value: unknown
  typeName?: string
  rows: number
  level: ZoomLevel
}

export function NodeZone({ label, value, typeName = "", rows, level }: Props) {
  if (rows === 0) return null
  const style = LEVEL_STYLE[level]
  const block = valueLines(value, rows, typeName, null, style.chars)
  return (
    <div className="flex min-w-0 gap-2">
      <span
        className="shrink-0 pt-px text-[9.5px] uppercase leading-[1.2] tracking-[0.06em] text-[#7C8CA3]"
        style={{ width: LABEL_WIDTH }}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        {block.lines.map((line, index) => (
          <div
            key={`${line.key}:${index}`}
            className="flex min-w-0 items-baseline gap-1.5 font-mono"
            style={{ fontSize: style.data, lineHeight: `${style.line}px` }}
          >
            {line.key !== "" && <span className="shrink-0 text-[#9FB0C4]">{line.key}</span>}
            <span className={`min-w-0 truncate ${TONE[line.tone]}`}>{line.text}</span>
          </div>
        ))}
        {block.more !== "" && (
          <div className="font-mono text-[9.5px] leading-[1.3] text-[#7C8CA3]">{block.more}</div>
        )}
      </div>
    </div>
  )
}
