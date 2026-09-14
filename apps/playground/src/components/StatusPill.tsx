import type { FlowStatus } from "../api/index.js"

const pills: Record<FlowStatus, string> = {
  ok: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  fail: "bg-red-950 text-red-300 ring-red-800",
}

export function StatusPill({ status }: { status: FlowStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ring-1 ${pills[status]}`}>
      {status}
    </span>
  )
}
