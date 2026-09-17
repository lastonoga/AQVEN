import { Matrix } from "@/components/studio"
import { isColumnOpen, type TraceContext } from "./context"
import { callFields, columnWidth, summaryTrailing } from "./fields"
import { columnPaint } from "./paint"

export type GroupMatrixProps = { readonly ctx: TraceContext; readonly label: string }

export function GroupMatrix({ ctx, label }: GroupMatrixProps) {
  const trailing = summaryTrailing(ctx.group, ctx)
  return (
    <Matrix
      orientation="columns"
      label={label}
      minItemWidth={columnWidth(ctx.group, ctx.depth)}
      items={ctx.group.columns}
      itemKey={(column) => column.id}
      itemPaint={(column) => columnPaint(column, isColumnOpen(ctx, column))}
      fields={callFields(ctx)}
      {...(trailing === undefined ? {} : { trailing })}
    />
  )
}
