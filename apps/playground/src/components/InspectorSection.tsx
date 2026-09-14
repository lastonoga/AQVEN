import type { ReactNode } from "react"

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-800/80 px-3 py-2.5 last:border-b-0">
      <h3 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">{title}</h3>
      {children}
    </section>
  )
}

export function InspectorNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-400">
      {children}
    </p>
  )
}

export function InspectorHint({ children }: { children: ReactNode }) {
  return <p className="text-[11.5px] leading-relaxed text-slate-500">{children}</p>
}
