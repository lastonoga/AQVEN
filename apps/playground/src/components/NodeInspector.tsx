import { useEffect, useState } from "react"
import { kindStyle } from "../graph/kinds.js"
import { InspectorSection } from "./InspectorSection.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { TypeBadge } from "./TypeBadge.js"
import { nodeIds, stepOf } from "./ir-value.js"
import { visibleTabs } from "./node-inspector-tabs.js"
import { useRunSnapshot } from "./run-context.js"
import type { TabId } from "./node-inspector-tabs.js"
import type { InspectorContext } from "./inspector-context.js"
import type { Ir, IrNode } from "../api/index.js"

type Props = {
  nodeId: string | null
  body: IrNode | null
  ir?: Ir | null
  onSelectNode?: (nodeId: string) => void
  onClose?: () => void
}

const noop = (): void => undefined

function FlowTypes({ ir }: { ir: Ir | null }) {
  if (ir === null) return null
  return (
    <InspectorSection title="типы воркфлоу">
      <KeyValueRows
        rows={[
          { label: "Вход", value: <TypeBadge type={ir.input} ir={ir} missing="вход не типизирован" /> },
          { label: "Выход", value: <TypeBadge type={ir.output.type} ir={ir} missing="выход не типизирован" /> },
        ]}
      />
    </InspectorSection>
  )
}

function Empty({ ir }: { ir: Ir | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FlowTypes ir={ir} />
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[12px] leading-relaxed text-slate-500">
          Выберите узел на схеме — здесь появятся его параметры, входы и промт.
        </p>
      </div>
    </div>
  )
}

export function NodeInspector({ nodeId, body, ir = null, onSelectNode = noop, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("overview")
  const run = useRunSnapshot()

  useEffect(() => setTab("overview"), [nodeId])

  if (nodeId === null || body === null) return <Empty ir={ir} />

  const context: InspectorContext = {
    nodeId,
    body,
    ir,
    known: nodeIds(ir),
    step: stepOf(ir, nodeId),
    total: ir === null ? 0 : Object.keys(ir.nodes).length,
    run,
    onSelectNode,
  }

  const tabs = visibleTabs(context)
  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0]
  if (active === undefined) return <Empty ir={ir} />
  const Active = active.component
  const style = kindStyle(body.kind)

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-slate-950/60">
      <header className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] leading-none ring-1 ${style.badge}`}>
          {style.label}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-100">{nodeId}</span>
        {context.step > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-slate-500">
            шаг {context.step}/{context.total}
          </span>
        )}
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            title="закрыть панель"
            className="shrink-0 rounded px-1 font-mono text-[12px] text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        )}
      </header>
      <nav className="flex shrink-0 gap-1 border-b border-slate-800 px-2 pt-1.5">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`-mb-px rounded-t border-b-2 px-2 py-1 text-[11.5px] ${
              entry.id === active.id
                ? "border-sky-400 text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto">
        <Active {...context} />
      </div>
    </div>
  )
}
