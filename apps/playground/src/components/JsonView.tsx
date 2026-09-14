import { useState } from "react"

type Tag = "array" | "object" | "string" | "number" | "boolean" | "null" | "other"

const primitiveClasses: Record<string, string> = {
  string: "text-amber-300",
  number: "text-sky-300",
  boolean: "text-violet-300",
  null: "text-slate-600",
  other: "text-slate-400",
}

const brackets: Record<"array" | "object", readonly [string, string]> = {
  array: ["[", "]"],
  object: ["{", "}"],
}

const tagOf = (value: unknown): Tag => {
  if (value === null || value === undefined) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "object") return "object"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  return "other"
}

const entriesOf = (value: unknown): ReadonlyArray<[string, unknown]> => {
  if (Array.isArray(value)) return value.map((item, index): [string, unknown] => [String(index), item])
  if (typeof value === "object" && value !== null) return Object.entries(value)
  return []
}

const primitiveText = (value: unknown, tag: Tag): string => {
  if (tag === "string") return `"${String(value)}"`
  if (tag === "null") return "null"
  return String(value)
}

const indent = (depth: number) => ({ paddingLeft: `${depth * 0.85}rem` })

function JsonKey({ name }: { name: string | null }) {
  if (name === null) return null
  return (
    <>
      <span className="text-slate-400">{name}</span>
      <span className="text-slate-600">: </span>
    </>
  )
}

type RowProps = { name: string | null; value: unknown; depth: number }

function JsonRow({ name, value, depth }: RowProps) {
  const tag = tagOf(value)
  const [open, setOpen] = useState(depth < 2)

  if (tag !== "array" && tag !== "object") {
    return (
      <div style={indent(depth)} className="whitespace-pre-wrap break-words">
        <JsonKey name={name} />
        <span className={primitiveClasses[tag]}>{primitiveText(value, tag)}</span>
      </div>
    )
  }

  const entries = entriesOf(value)
  const [head, tail] = brackets[tag]

  if (entries.length === 0) {
    return (
      <div style={indent(depth)}>
        <JsonKey name={name} />
        <span className="text-slate-600">{head}{tail}</span>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={indent(depth)}
        className="flex w-full items-baseline gap-1 text-left hover:bg-slate-900/70"
      >
        <span className="w-2 shrink-0 text-slate-600">{open ? "▾" : "▸"}</span>
        <span className="min-w-0 break-words">
          <JsonKey name={name} />
          <span className="text-slate-600">{head}</span>
          {!open && <span className="text-slate-600">{` ${entries.length} `}{tail}</span>}
        </span>
      </button>
      {open && entries.map(([key, item]) => <JsonRow key={key} name={key} value={item} depth={depth + 1} />)}
      {open && (
        <div style={indent(depth)} className="text-slate-600">
          <span className="inline-block w-3" />
          {tail}
        </div>
      )}
    </div>
  )
}

export function JsonView({ value }: { value: unknown }) {
  return (
    <div className="font-mono text-[11.5px] leading-[1.65] text-slate-300">
      <JsonRow name={null} value={value} depth={0} />
    </div>
  )
}
