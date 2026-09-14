import { KindGlyph } from "../graph/KindGlyph.js"
import { kindStyle } from "../graph/kinds.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { RunValueView, ValueView } from "./ValueView.js"
import { ValuePopover } from "./ValuePopover.js"
import type { Ref, RefError, RefOrigin, RefRoot, SlotProvenance } from "../refs/index.js"
import type { KindShape } from "../graph/kinds.js"

type Props = { provenance: SlotProvenance; raw: unknown; onSelectNode: (nodeId: string) => void }

type Mark = { shape: KindShape; badge: string }

const rootMarks: Record<RefRoot, Mark> = {
  node: { shape: "square", badge: "bg-slate-800 text-slate-300 ring-slate-600" },
  input: { shape: "ring", badge: "bg-slate-800 text-slate-300 ring-slate-600" },
  item: { shape: "diamond", badge: "bg-teal-950 text-teal-300 ring-teal-700" },
  acc: { shape: "bars", badge: "bg-indigo-950 text-indigo-300 ring-indigo-700" },
  iter: { shape: "ring", badge: "bg-slate-800 text-slate-400 ring-slate-600" },
}

const markOf = (target: Ref, origin: RefOrigin | null): Mark => {
  if (target.root !== "node") return rootMarks[target.root]
  if (origin === null) return rootMarks["node"]
  const style = kindStyle(origin.nodeKind)
  return { shape: style.shape, badge: style.badge }
}

const headOf = (target: Ref, origin: RefOrigin | null): string => {
  if (target.root === "node") return target.node
  return origin?.label ?? target.root
}

const literalLabels: Record<"const" | "inline", string> = { const: "конст", inline: "литерал" }

function LiteralValue({ kind, value }: { kind: "const" | "inline"; value: unknown }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-slate-600">
        {literalLabels[kind]}
      </span>
      <span className="min-w-0">
        <ValueView value={value} depth={2} />
      </span>
    </span>
  )
}

function BrokenRef({ error, value }: { error: RefError | null; value: unknown }) {
  const message = error?.message ?? "ссылка не разобрана"
  return (
    <ValuePopover content={<p className="text-[11.5px] leading-relaxed text-red-300">{message}</p>}>
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded border border-red-900/70 bg-red-950/30 px-1 py-[1px]">
        <span className="shrink-0 font-mono text-[10px] text-red-400">!</span>
        <span className="truncate font-mono text-[11px] text-red-300">{String(value)}</span>
      </span>
    </ValuePopover>
  )
}

export function RefCard({ target, provenance }: { target: Ref; provenance: SlotProvenance }) {
  const origin = provenance.origin
  const originError = provenance.originError
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">ссылка</span>
        <span className="break-all font-mono text-[12px] text-sky-300">{target.text}</span>
      </div>
      {originError !== null && (
        <p className="rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1 text-[11.5px] text-amber-300">
          {originError.message}
        </p>
      )}
      {origin !== null && (
        <KeyValueRows
          rows={[
            { label: "Источник", value: origin.label },
            { label: "Вид узла", value: origin.nodeKind === "" ? "" : kindStyle(origin.nodeKind).title },
            {
              label: "Описание",
              value:
                origin.description === "" ? "" : <span className="font-sans text-slate-300">{origin.description}</span>,
            },
            { label: "Тип значения", value: origin.type },
            { label: "Подъём", value: target.lifted ? "[*] — массив разворачивается" : "" },
          ]}
        />
      )}
      <div className="flex flex-col gap-1 border-t border-slate-800 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">значение в прогоне</span>
        <RunValueView found={provenance.value} reason={provenance.valueError?.message ?? "значения нет"} />
      </div>
      {origin !== null && target.root === "node" && (
        <p className="text-[10.5px] text-slate-600">Клик по ссылке выделяет узел-источник на схеме.</p>
      )}
    </div>
  )
}

type ChipProps = { provenance: SlotProvenance; target: Ref; onSelectNode: (nodeId: string) => void }

function Chip({ provenance, target, onSelectNode }: ChipProps) {
  const origin = provenance.origin
  const mark = markOf(target, origin)
  const navigable = target.root === "node" && origin !== null
  const tone = provenance.originError !== null
    ? "border-amber-900/70 bg-amber-950/20"
    : "border-slate-700 bg-slate-900/80 hover:border-sky-600 hover:bg-slate-800/80"
  const shell = `inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1 py-[1px] text-left ${tone}`

  const body = (
    <>
      <span className={`shrink-0 rounded px-[3px] py-[2px] leading-none ring-1 ${mark.badge}`}>
        <KindGlyph shape={mark.shape} size={8} />
      </span>
      <span className="truncate font-mono text-[11px] text-sky-300">{headOf(target, origin)}</span>
      {target.path !== "" && <span className="truncate font-mono text-[11px] text-slate-500">.{target.path}</span>}
      {origin !== null && origin.rootType !== "" && origin.type !== "" && (
        <span className="shrink-0 rounded bg-slate-800 px-1 font-mono text-[10px] text-slate-400">{origin.type}</span>
      )}
    </>
  )

  return (
    <ValuePopover content={<RefCard target={target} provenance={provenance} />}>
      {navigable ? (
        <button type="button" onClick={() => onSelectNode(target.node)} className={shell} title="выделить узел-источник">
          {body}
        </button>
      ) : (
        <span className={shell}>{body}</span>
      )}
    </ValuePopover>
  )
}

export function RefChip({ provenance, raw, onSelectNode }: Props) {
  if (provenance.kind === "const") return <LiteralValue kind="const" value={provenance.value?.value} />
  if (provenance.kind === "inline") return <LiteralValue kind="inline" value={provenance.value?.value} />
  if (provenance.ref === null) return <BrokenRef error={provenance.originError} value={raw} />
  return <Chip provenance={provenance} target={provenance.ref} onSelectNode={onSelectNode} />
}
