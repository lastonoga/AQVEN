import type { Diagnostic } from "../api/index.js"

const location = (diagnostic: Diagnostic): string =>
  [diagnostic.nodeId, diagnostic.slot].filter((part) => part !== undefined).join(".")

export function DiagnosticList({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  if (diagnostics.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}:${index}`} className="flex items-baseline gap-2 text-[12px]">
          <span className="shrink-0 rounded bg-red-950 px-1.5 py-0.5 font-mono text-[10px] text-red-300 ring-1 ring-red-800">
            {diagnostic.code}
          </span>
          <span className="text-slate-300">{diagnostic.message}</span>
          <span className="font-mono text-[11px] text-slate-500">{location(diagnostic)}</span>
        </li>
      ))}
    </ul>
  )
}
