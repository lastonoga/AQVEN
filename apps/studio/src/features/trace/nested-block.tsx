import type { ColumnPath, NestedBlock as NestedRun } from "@/domain"
import { Heading, Surface, Tag } from "@/components/studio"
import { columnPathOf, groupContext, openChildColumn, type TraceContext, type TraceScope } from "./context"
import { GroupMatrix } from "./group-matrix"
import { nestedHeading } from "./nested"

export type NestedBlockProps = {
  readonly block: NestedRun
  readonly path: ColumnPath
  readonly depth: number
  readonly scope: TraceScope
}

export function NestedBlock({ block, path, depth, scope }: NestedBlockProps) {
  const ctx = groupContext(scope, block.group, path, depth)
  const heading = nestedHeading(block, depth, scope.t)
  const tags = (
    <>
      <Tag>{heading.depthLabel}</Tag>
      <Tag tone={heading.tone}>{heading.kindLabel}</Tag>
    </>
  )
  return (
    <Surface variant="well" padding="sm" accent="left-3" tone={heading.tone} id={path}>
      <Heading size="item" leading={tags} title={heading.title} description={heading.hint}>
        <div className="flex flex-col gap-2.75">
          <Surface variant="panel" radius="lg" className="overflow-x-auto">
            <GroupMatrix ctx={ctx} label={heading.title} />
          </Surface>
          <OpenNestedBlock ctx={ctx} />
        </div>
      </Heading>
    </Surface>
  )
}

export function OpenNestedBlock({ ctx }: { readonly ctx: TraceContext }) {
  const column = openChildColumn(ctx)
  if (column?.child === undefined) return null
  return <NestedBlock block={column.child.block} path={columnPathOf(ctx, column)} depth={ctx.depth + 1} scope={ctx} />
}
