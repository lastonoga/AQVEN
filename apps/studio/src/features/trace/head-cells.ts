import type { CallColumn, ChildLabel, ColumnFlag, StageKind } from "@/domain"
import { NODE_KIND, OUTCOME_TONE, type CellBlock, type ExpanderSpec, type TagSpec, type Tone } from "@/components/studio"
import { joinMeta, usd, duration } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { TAG_STYLE } from "./blocks"
import { columnPathOf, type TraceContext } from "./context"

type SubtitleRule = (column: CallColumn, ctx: TraceContext) => string | undefined

const NO_BLOCKS: readonly CellBlock[] = []

const EXPANDER_LABEL: Readonly<Record<ChildLabel, (t: Translator, count: number) => string>> = {
  loop: (t, count) => t("trace.expander.loop", { count }),
  judges: (t, count) => t("trace.expander.judges", { count }),
  map: (t, count) => t("trace.expander.map", { count }),
}

const COLUMN_FLAG_TONE: Readonly<Record<ColumnFlag, Tone>> = {
  loopBody: "loop",
  best: "success",
  selected: "success",
}

const CALL_HEADING_SIZE = { run: "cell", trace: "item" } as const

const STATUS_TAGS = ["degraded", "aborted"] as const

const agentCostTime: SubtitleRule = (column) => {
  const agent = column.agent
  if (agent === undefined) return undefined
  return joinMeta([usd(agent.costUsd), agent.durationS === undefined ? undefined : duration(agent.durationS)])
}

const agentModel: SubtitleRule = (column) => {
  const title = column.agent?.title
  return title?.kind === "model" ? title.model : undefined
}

const claimOrdinal: SubtitleRule = (column, ctx) => ctx.t("trace.nested.claim", { n: ctx.group.columns.indexOf(column) + 1 })

const NESTED_SUBTITLE: Partial<Readonly<Record<StageKind, SubtitleRule>>> = {
  loop: agentCostTime,
  parallel: agentModel,
  map: claimOrdinal,
}

const columnSubtitle = (column: CallColumn, ctx: TraceContext): string | undefined => {
  if (column.subtitle !== undefined) return column.subtitle
  if (ctx.group.kind === undefined) return undefined
  return NESTED_SUBTITLE[ctx.group.kind]?.(column, ctx)
}

const childExpander = (column: CallColumn, ctx: TraceContext): Pick<CellBlock<"heading">, "expander"> => {
  const child = column.child
  if (child === undefined) return {}
  const path = columnPathOf(ctx, column)
  const expander: ExpanderSpec = {
    label: EXPANDER_LABEL[child.label](ctx.t, child.block.fanOut),
    ariaLabel: ctx.t("trace.expander.toggleAria", { name: column.name }),
    open: ctx.open.isOpen(path),
    controls: path,
    onToggle: () => {
      ctx.open.toggle(path)
    },
  }
  return { expander }
}

const familyDots = (column: CallColumn, ctx: TraceContext): Pick<CellBlock<"heading">, "dots" | "dotShape"> => {
  if (column.family === undefined) return {}
  return { dots: [column.family], dotShape: ctx.depth > 1 ? "square" : "round" }
}

const headingSubtitle = (column: CallColumn, ctx: TraceContext): Pick<CellBlock<"heading">, "subtitle"> => {
  const subtitle = columnSubtitle(column, ctx)
  return subtitle === undefined ? {} : { subtitle }
}

export const columnsCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const heading: CellBlock<"heading"> = {
    kind: "heading",
    size: "cell",
    title: column.name,
    ...headingSubtitle(column, ctx),
    ...familyDots(column, ctx),
    ...childExpander(column, ctx),
  }
  return [heading]
}

const kindTags = (column: CallColumn, ctx: TraceContext): readonly TagSpec[] => {
  const style = TAG_STYLE[ctx.variant]
  const kind = column.kind === undefined ? [] : [{ ...style, tone: NODE_KIND[column.kind].tone, children: NODE_KIND[column.kind].code }]
  const verdictCase = column.case === undefined ? [] : [{ ...style, tone: "neutral" as const, children: ctx.t("domain.columnFlag.case", { value: column.case }) }]
  const flags = (column.flags ?? []).map((flag) => ({ ...style, tone: COLUMN_FLAG_TONE[flag], children: ctx.t(`domain.columnFlag.${flag}`) }))
  const statuses = STATUS_TAGS.filter((status) => column.status === status).map((status) => ({
    ...style,
    tone: OUTCOME_TONE[status],
    children: ctx.t(`domain.outcome.${status}`),
  }))
  return [...kind, ...verdictCase, ...flags, ...statuses]
}

const callTagsBlock = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const tags = kindTags(column, ctx)
  const text = joinMeta([column.subtitle, column.status === "cached" ? ctx.t("trace.call.cached") : undefined])
  if (tags.length === 0 && text.length === 0) return NO_BLOCKS
  const block: CellBlock<"tags"> = text.length === 0 ? { kind: "tags", tags } : { kind: "tags", tags, text }
  return [block]
}

const statusDots = (column: CallColumn): Pick<CellBlock<"heading">, "dots"> => {
  if (column.kind === undefined) return {}
  return { dots: [OUTCOME_TONE[column.status ?? "intermediate"]] }
}

const plainCallCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const heading: CellBlock<"heading"> = {
    kind: "heading",
    size: CALL_HEADING_SIZE[ctx.variant],
    title: column.name,
    menu: true,
    ...statusDots(column),
  }
  return [heading, ...callTagsBlock(column, ctx)]
}

const headedCallCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const best = column.flags?.includes("best") === true
  const tags: readonly TagSpec[] = best ? [{ tone: "success", fill: "soft", size: "sm", children: ctx.t("domain.columnFlag.best") }] : []
  return [{ kind: "heading", size: "tiny", title: column.callText ?? column.name, tags }]
}

export const callCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] =>
  ctx.headed ? headedCallCells(column, ctx) : plainCallCells(column, ctx)
