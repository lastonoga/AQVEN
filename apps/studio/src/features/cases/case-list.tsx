import type { ReactNode } from "react"
import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase } from "@/domain"
import { Surface, Text } from "@/components/studio"
import { caseTags, hasExpected, nodeOutputIds, tagSummary, tagTokens } from "./model"

export type CaseListProps = {
  readonly cases: readonly ApiDatasetCase[]
  readonly selection: ReadonlySet<string>
  readonly expanded: string | null
  readonly revealed: string | null
  readonly detail: (item: ApiDatasetCase, id: string) => ReactNode
  readonly onToggle: (name: string) => void
  readonly onSelectShown: (selected: boolean) => void
  readonly onExpand: (name: string | null) => void
}

type CaseRowProps = {
  readonly item: ApiDatasetCase
  readonly selected: boolean
  readonly open: boolean
  readonly revealed: boolean
  readonly detail: ReactNode
  readonly detailId: string
  readonly onToggle: () => void
  readonly onExpand: () => void
}

const ROW_GRID = "grid grid-cols-[1rem_minmax(10rem,14rem)_minmax(0,1fr)_4rem_5.5rem] items-center gap-x-2.5 px-3"

const TAG_PREVIEW = 3
const VALUE_JOIN = " · "
const TOKEN_JOIN = ", "

const detailIdOf = (name: string): string => `case-detail-${name}`

const reveal = (element: HTMLElement | null): void => {
  element?.scrollIntoView({ block: "start" })
}

function SelectAll({ cases, selection, onSelectShown }: Pick<CaseListProps, "cases" | "selection" | "onSelectShown">) {
  const t = useTranslations("cases.list")
  const chosen = cases.filter((item) => selection.has(item.name)).length
  const all = cases.length > 0 && chosen === cases.length
  return (
    <input
      type="checkbox"
      aria-label={all ? t("deselectShown") : t("selectShown")}
      checked={all}
      disabled={cases.length === 0}
      ref={(element) => {
        if (element !== null) element.indeterminate = chosen > 0 && !all
      }}
      onChange={() => {
        onSelectShown(!all)
      }}
    />
  )
}

function ListHead(props: Pick<CaseListProps, "cases" | "selection" | "onSelectShown">) {
  const t = useTranslations("cases.list")
  return (
    <div className={cn(ROW_GRID, "h-9 border-b border-border bg-muted/60")}>
      <SelectAll cases={props.cases} selection={props.selection} onSelectShown={props.onSelectShown} />
      <Text role="column" tone="neutral">{t("case")}</Text>
      <Text role="column" tone="neutral">{t("tags")}</Text>
      <Text role="column" tone="neutral">{t("expected")}</Text>
      <Text role="column" tone="neutral">{t("nodeOutputs")}</Text>
    </div>
  )
}

function ExpectedMark({ item }: { readonly item: ApiDatasetCase }) {
  const t = useTranslations("cases.list")
  if (hasExpected(item)) return <Text role="cell" tone="success" weight="semibold" title={t("hasExpected")}>{t("yes")}</Text>
  return <Text role="cell" tone="faint" title={t("noExpected")}>{t("none")}</Text>
}

function OutputsMark({ item }: { readonly item: ApiDatasetCase }) {
  const t = useTranslations("cases.list")
  const nodes = nodeOutputIds(item)
  if (nodes.length === 0) return <Text role="cell" tone="faint" title={t("noOutputs")}>{t("none")}</Text>
  return <Text role="cell" title={t("outputsOf", { nodes: nodes.join(", ") })}>{nodes.length}</Text>
}

function TagsCell({ item }: { readonly item: ApiDatasetCase }) {
  const t = useTranslations("cases.list")
  const tags = caseTags(item)
  const summary = tagSummary(tags, TAG_PREVIEW)
  const parts = summary.hidden === 0 ? summary.values : [...summary.values, t("moreTags", { count: summary.hidden })]
  if (parts.length === 0) return <Text role="cell" tone="faint">{t("none")}</Text>
  return (
    <Text role="cell" tone="default" truncate title={tagTokens(tags).join(TOKEN_JOIN)}>
      {parts.join(VALUE_JOIN)}
    </Text>
  )
}

function CaseRow({ item, selected, open, revealed, detail, detailId, onToggle, onExpand }: CaseRowProps) {
  const t = useTranslations("cases.list")
  return (
    <li ref={revealed ? reveal : undefined} aria-current={open ? "true" : undefined} className="border-b border-border last:border-b-0">
      <div className={cn(ROW_GRID, "h-9", open ? "bg-muted/50" : "hover:bg-muted/30")}>
        <input type="checkbox" aria-label={t("select", { name: item.name })} checked={selected} onChange={onToggle} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={onExpand}
          className="flex min-w-0 items-center gap-1.5 text-left outline-none focus-visible:underline"
        >
          <ChevronRight aria-hidden className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <Text role="cell" weight="semibold" truncate title={item.name}>{item.name}</Text>
        </button>
        <TagsCell item={item} />
        <ExpectedMark item={item} />
        <OutputsMark item={item} />
      </div>
      {open ? detail : null}
    </li>
  )
}

export function CaseList({ cases, selection, expanded, revealed, detail, onToggle, onSelectShown, onExpand }: CaseListProps) {
  const t = useTranslations("cases")
  return (
    <Surface variant="panel" className="overflow-hidden">
      <ListHead cases={cases} selection={selection} onSelectShown={onSelectShown} />
      {cases.length === 0 ? <Text as="p" role="hint" tone="neutral" className="px-3 py-6 text-center">{t("filter.noMatch")}</Text> : (
        <ul aria-label={t("list.aria")}>
          {cases.map((item) => {
            const open = item.name === expanded
            const detailId = detailIdOf(item.name)
            return (
              <CaseRow
                key={item.name}
                item={item}
                selected={selection.has(item.name)}
                open={open}
                revealed={item.name === revealed}
                detail={open ? detail(item, detailId) : null}
                detailId={detailId}
                onToggle={() => {
                  onToggle(item.name)
                }}
                onExpand={() => {
                  onExpand(open ? null : item.name)
                }}
              />
            )
          })}
        </ul>
      )}
    </Surface>
  )
}
