import type { ReactNode } from "react"

export type KeyValueRow = { label: string; value: ReactNode }

const isEmpty = (value: ReactNode): boolean => value === null || value === undefined || value === ""

export function KeyValueRows({ rows }: { rows: readonly KeyValueRow[] }) {
  const visible = rows.filter((row) => !isEmpty(row.value))
  if (visible.length === 0) return null
  return (
    <dl className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
      {visible.map((row) => (
        <div key={row.label} className="contents">
          <dt className="truncate py-0.5 text-[11.5px] text-slate-500" title={row.label}>
            {row.label}
          </dt>
          <dd className="min-w-0 py-0.5 font-mono text-[11.5px] break-words text-slate-200">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
