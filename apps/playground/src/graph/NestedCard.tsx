import { KindGlyph } from "./KindGlyph.js"
import { kindStyle } from "./kinds.js"
import type { NestedNode } from "./node-facts.js"

type Props = { nested: NestedNode }

export function NestedCard({ nested }: Props) {
  const style = kindStyle(nested.kind)
  const facts = nested.facts.slice(0, 2)
  return (
    <div className="mx-3 mb-2.5 rounded border border-dashed border-slate-700 bg-slate-950/70 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">внутри</span>
        <span className={`inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] leading-none ring-1 ${style.badge}`}>
          <KindGlyph shape={style.shape} size={8} />
          {style.label}
        </span>
        <span className="truncate font-mono text-[12.5px] text-slate-200">{nested.name}</span>
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
        {facts.map((fact) => `${fact.label}: ${fact.value}`).join(" · ")}
      </div>
    </div>
  )
}
