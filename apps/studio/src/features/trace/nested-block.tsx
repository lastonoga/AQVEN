import { NODE_KIND, Surface, Heading } from "@/components/studio"
import { groupContext, openChildColumn, type TraceContext } from "./context"
import { GroupMatrix } from "./group-matrix"

export type NestedBlockProps = { readonly ctx: TraceContext }

export function OpenNestedBlock({ ctx }: NestedBlockProps) {
  const column = openChildColumn(ctx)
  const child = column?.child
  if (column === undefined || child === undefined || child === null) return null
  const nested = groupContext(ctx, child.group, ctx.depth + 1)
  return (
    <Surface variant="panel" className="overflow-hidden" id={column.id}>
      <Heading
        size="label"
        title={ctx.t("trace.nested.title", { name: column.name })}
        tags={[{ tone: NODE_KIND[child.kind].tone, fill: "tint", size: "micro", children: NODE_KIND[child.kind].code }]}
        description={ctx.t("trace.nested.fanOut", { count: child.fanOut })}
        className="px-2.5 pt-2"
      />
      <div className="overflow-x-auto">
        <GroupMatrix ctx={nested} label={column.name} />
      </div>
      <OpenNestedBlock ctx={nested} />
    </Surface>
  )
}
