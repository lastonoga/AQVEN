import { Matrix } from "@/components/studio"
import { executionKey } from "./build"
import { isColumnOpen, type TraceContext } from "./context"
import { callFields, columnWidth } from "./fields"
import { columnPaint } from "./paint"

export type GroupMatrixProps = { readonly ctx: TraceContext; readonly label: string }

export function GroupMatrix({ ctx, label }: GroupMatrixProps) {
  return (
    <div className="min-w-0">
      <Matrix
        orientation="columns"
        label={label}
        minItemWidth={columnWidth(ctx.depth)}
        items={ctx.group.columns}
        itemKey={(column) => column.id}
        itemPaint={(column) => columnPaint(column, isColumnOpen(ctx, column), executionKey(column.address) === ctx.selected)}
        fields={callFields(ctx)}
      />
    </div>
  )
}
