import { useState } from "react"
import type { ReactNode } from "react"
import { formatBytes } from "../refs/index.js"
import type { RefValue } from "../refs/index.js"

const OPEN_DEPTH = 1
const PREVIEW_ROWS = 6
const MAX_ROWS = 500
const STRING_LIMIT = 2048
const SUMMARY_CHARS = 48

const encoder = new TextEncoder()

const byteLength = (text: string): number => encoder.encode(text).length

const plural = (count: number, one: string, few: string, many: string): string => {
  const teens = count % 100
  if (teens >= 11 && teens <= 14) return many
  const last = count % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const scalarTone: Record<string, string> = {
  number: "text-amber-300",
  boolean: "text-sky-300",
  bigint: "text-amber-300",
}

function Muted({ text }: { text: string }) {
  return <span className="font-mono text-[11.5px] text-slate-600">{text}</span>
}

function Scalar({ value }: { value: unknown }) {
  const tone = scalarTone[typeof value] ?? "text-slate-300"
  return <span className={`font-mono text-[12px] break-words ${tone}`}>{String(value)}</span>
}

const TOGGLE = "self-start rounded px-1 font-mono text-[10px] text-slate-500 hover:bg-slate-800 hover:text-slate-300"

function StringValue({ value }: { value: string }) {
  const [full, setFull] = useState(false)
  const total = byteLength(value)

  if (total <= STRING_LIMIT) {
    return <span className="whitespace-pre-wrap break-words font-mono text-[12px] text-emerald-300">{value}</span>
  }

  const head = value.slice(0, STRING_LIMIT)
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="whitespace-pre-wrap break-words font-mono text-[12px] text-emerald-300">
        {full ? value : `${head}…`}
      </span>
      <span className="font-mono text-[10px] text-slate-600">
        {full
          ? `показано ${formatBytes(total)} целиком`
          : `показано ${formatBytes(byteLength(head))} из ${formatBytes(total)}`}
      </span>
      <button type="button" onClick={() => setFull(!full)} className={TOGGLE}>
        {full ? "свернуть" : "показать полностью"}
      </button>
    </span>
  )
}

type BranchProps = { label: string; entries: ReadonlyArray<[string, unknown]>; depth: number }

function Branch({ label, entries, depth }: BranchProps) {
  const [open, setOpen] = useState(depth <= OPEN_DEPTH)
  const [expanded, setExpanded] = useState(false)
  const shown = entries.slice(0, expanded ? MAX_ROWS : PREVIEW_ROWS)
  const hidden = entries.length - shown.length

  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-baseline gap-1 self-start rounded px-0.5 hover:bg-slate-800/60"
      >
        <span className="w-2 shrink-0 font-mono text-[10px] text-slate-600">{open ? "▾" : "▸"}</span>
        <span className="font-mono text-[11px] text-slate-500">{label}</span>
      </button>
      {open && (
        <div className="mt-0.5 flex min-w-0 flex-col gap-0.5 border-l border-slate-800 pl-2">
          {shown.map(([key, item]) => (
            <div key={key} className="flex min-w-0 gap-2">
              <span className="shrink-0 font-mono text-[11px] text-slate-500">{key}</span>
              <div className="min-w-0 flex-1">
                <ValueView value={item} depth={depth + 1} />
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className={TOGGLE}>
              показано {shown.length} из {entries.length} · показать ещё
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const indexed = (value: readonly unknown[]): ReadonlyArray<[string, unknown]> =>
  value.map((item, index): [string, unknown] => [`[${index}]`, item])

export function ValueView({ value, depth = 0 }: { value: unknown; depth?: number }): ReactNode {
  if (value === undefined) return <Muted text="—" />
  if (value === null) return <Muted text="null" />
  if (typeof value === "string") return <StringValue value={value} />
  if (Array.isArray(value)) {
    if (value.length === 0) return <Muted text="пустой массив" />
    const label = `массив · ${value.length} ${plural(value.length, "элемент", "элемента", "элементов")}`
    return <Branch label={label} entries={indexed(value)} depth={depth} />
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return <Muted text="пустой объект" />
    const label = `объект · ${entries.length} ${plural(entries.length, "поле", "поля", "полей")}`
    return <Branch label={label} entries={entries} depth={depth} />
  }
  return <Scalar value={value} />
}

const clip = (text: string): string => (text.length <= SUMMARY_CHARS ? text : `${text.slice(0, SUMMARY_CHARS - 1)}…`)

export const valueSummary = (value: unknown): string => {
  if (value === undefined) return "—"
  if (value === null) return "null"
  if (typeof value === "string") return clip(value)
  if (Array.isArray(value)) return `массив · ${value.length}`
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) return "{}"
    return clip(`{ ${keys.join(", ")} }`)
  }
  return clip(String(value))
}

export function ValuePreview({ value }: { value: unknown }) {
  return <span className="block truncate font-mono text-[11.5px] text-slate-300">{valueSummary(value)}</span>
}

const scopeNotes: Record<RefValue["scope"], string> = {
  single: "",
  iterations: "по всем итерациям map",
}

export function RunValueView({ found, reason }: { found: RefValue | null; reason: string }) {
  if (found === null) return <p className="text-[11.5px] leading-relaxed text-slate-600">{reason}</p>
  const note = scopeNotes[found.scope]
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <ValueView value={found.value} />
      <span className="font-mono text-[10px] text-slate-600">
        {[formatBytes(found.preview.totalBytes), note, found.lifted ? "подъём [*]" : ""]
          .filter((part) => part !== "")
          .join(" · ")}
      </span>
    </div>
  )
}
