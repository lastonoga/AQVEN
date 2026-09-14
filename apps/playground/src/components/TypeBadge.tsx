import { useState } from "react"
import { ValuePopover } from "./ValuePopover.js"
import { TypeCard, TypeDialog, useTypeLink } from "./TypeView.js"
import type { Ir } from "../api/index.js"

type Props = { type: string; ir: Ir | null; missing?: string }

const SHELL = "inline-flex min-w-0 max-w-full items-baseline gap-1 rounded border px-1 py-[1px] text-left"

const KNOWN = `${SHELL} border-slate-700 bg-slate-900/80 hover:border-sky-600 hover:bg-slate-800/80`

const UNKNOWN = `${SHELL} border-dashed border-slate-800 bg-slate-900/40`

export function TypeBadge({ type, ir, missing = "тип не объявлен" }: Props) {
  const link = useTypeLink(type, ir)
  const [open, setOpen] = useState(false)

  if (type.trim() === "") return <span className="font-mono text-[11px] text-slate-600">{missing}</span>

  const known = link.schema !== null

  return (
    <>
      <ValuePopover content={<TypeCard type={type} ir={ir} />}>
        {known ? (
          <button type="button" onClick={() => setOpen(true)} className={KNOWN} title="открыть тип целиком">
            <span className="truncate font-mono text-[11px] text-sky-300">{type}</span>
          </button>
        ) : (
          <span className={UNKNOWN} title="схема типа не объявлена — показывается только имя">
            <span className="truncate font-mono text-[11px] text-slate-300">{type}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-600">без схемы</span>
          </span>
        )}
      </ValuePopover>
      {open && <TypeDialog type={type} ir={ir} onClose={() => setOpen(false)} />}
    </>
  )
}
