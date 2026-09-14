import type { ReactNode } from "react"
import type { SlotSource } from "./ir-value.js"

type Props = { source: SlotSource; known: ReadonlySet<string>; onSelectNode: (nodeId: string) => void }

const compact = (value: unknown): string => {
  const text = JSON.stringify(value)
  if (text === undefined) return String(value)
  if (text.length <= 48) return text
  return `${text.slice(0, 47)}…`
}

function NodeLink({ source, known, onSelectNode }: Props) {
  if (source.origin !== "node") return null
  const target = source.node
  const suffix = source.path === "" ? "" : `.${source.path}`
  if (!known.has(target)) return <span className="text-slate-300">{`${target}${suffix}`}</span>
  return (
    <button
      type="button"
      onClick={() => onSelectNode(target)}
      className="text-left text-sky-400 underline decoration-sky-800 underline-offset-2 hover:text-sky-300"
      title="показать узел на схеме"
    >
      {target}
      <span className="text-slate-500">{suffix}</span>
    </button>
  )
}

const withPath = (label: string, path: string): ReactNode => (
  <span className="text-slate-300">
    {label}
    {path !== "" && <span className="text-slate-500">{`.${path}`}</span>}
  </span>
)

export function SlotSourceView({ source, known, onSelectNode }: Props) {
  if (source.origin === "node") return <NodeLink source={source} known={known} onSelectNode={onSelectNode} />
  if (source.origin === "input") return withPath("вход воркфлоу", source.path)
  if (source.origin === "item") return withPath("элемент коллекции", source.path)
  if (source.origin === "const")
    return (
      <span className="text-slate-300">
        <span className="text-slate-500">конст. </span>
        {compact(source.value)}
      </span>
    )
  return <span className="text-slate-400">{compact(source.value)}</span>
}
