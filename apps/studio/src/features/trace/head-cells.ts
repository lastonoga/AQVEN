import { NODE_KIND, type CellBlock, type ExpanderSpec, type TagSpec } from "@/components/studio"
import type { TraceContext } from "./context"
import type { CallColumn } from "./model"
import { statusTone } from "./paint"

const childExpander = (column: CallColumn, ctx: TraceContext): Pick<CellBlock<"heading">, "expander"> => {
  const child = column.child
  if (child === null) return {}
  const expander: ExpanderSpec = {
    label: ctx.t("trace.expander.children", { count: child.fanOut }),
    ariaLabel: ctx.t("trace.expander.toggleAria", { name: column.name }),
    open: ctx.open.isOpen(column.id),
    controls: column.id,
    onToggle: () => {
      ctx.open.toggle(column.id)
    },
  }
  return { expander }
}

const coordinateTag = (column: CallColumn, ctx: TraceContext): readonly TagSpec[] => {
  const coordinate = column.coordinate
  if (coordinate === null) return []
  return [{ tone: "neutral", fill: "outline", size: "micro", children: ctx.t(`trace.coordinate.${coordinate.kind}`, { value: coordinate.value }) }]
}

const flagTags = (column: CallColumn, ctx: TraceContext): readonly TagSpec[] => [
  ...(column.agent.cacheHit ? [{ tone: "success" as const, fill: "outline" as const, size: "micro" as const, children: ctx.t("trace.call.cached") }] : []),
  ...(column.agent.degraded ? [{ tone: "warning" as const, fill: "outline" as const, size: "micro" as const, children: ctx.t("trace.call.degraded") }] : []),
]

export const callCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const heading: CellBlock<"heading"> = {
    kind: "heading",
    size: "cell",
    title: column.name,
    dots: [statusTone(column.status)],
    tags: [{ tone: NODE_KIND[column.kind].tone, fill: "tint", size: "micro", children: NODE_KIND[column.kind].code }, ...coordinateTag(column, ctx)],
    ...childExpander(column, ctx),
  }
  const flags = flagTags(column, ctx)
  const status: CellBlock<"inline"> = {
    kind: "inline",
    lines: [ctx.t(`domain.executionStatus.${column.status}`)],
    role: "tiny",
    tone: statusTone(column.status),
  }
  if (flags.length === 0) return [heading, status]
  return [heading, status, { kind: "tags", tags: flags }]
}
