import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, ExperimentFactor, FactorKind, NodeId, VariantId } from "@/domain"
import { Matrix, Surface, Text, type MatrixField } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { ExperimentFacts } from "./experiment-facts"
import type { GraphView } from "./graph-model"
import { HypothesisCard } from "./hypothesis-card"
import { RowRoleTag } from "./role-tag"
import type { PageFocus } from "./use-page-focus"
import { nodesText, stepName, variantTable, type AgentModel, type FactorValue, type VariantRow } from "./variant-table"
import { WhatChanges } from "./change-list"
import { isBlockKind, valueAction, type ChangeBlock, type ValueAction } from "./what-changes"

export type WhatWeTestProps = {
  readonly experiment: ExperimentDetail
  readonly views: readonly GraphView[]
  readonly blocks: readonly ChangeBlock[]
  readonly focus: PageFocus
}

type ValueCellProps = {
  readonly what: FactorKind
  readonly variant: VariantId
  readonly values: readonly FactorValue[]
  readonly views: readonly GraphView[]
  readonly blocks: readonly ChangeBlock[]
  readonly focus: PageFocus
}

type ValueLinkProps = { readonly action: ValueAction; readonly focus: PageFocus; readonly children: string }

const CAPTION_JOIN = ", "
const LINK_CLASS = "cursor-pointer rounded-xs text-left underline decoration-dotted underline-offset-3 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"

function SlotButton({ node, onShow }: { readonly node: NodeId; readonly onShow: (node: NodeId) => void }) {
  const t = useTranslations("research.experiment.what")
  return (
    <button
      type="button"
      aria-label={t("slotAria", { node: stepName(node) })}
      className={LINK_CLASS}
      onClick={() => {
        onShow(node)
      }}
    >
      {stepName(node)}
    </button>
  )
}

function FactorCaption({ factor, onShowSlot }: { readonly factor: ExperimentFactor | null; readonly onShowSlot: (node: NodeId) => void }) {
  const t = useTranslations("research.experiment.what.factor")
  if (factor === null) return null
  const nodes = (): ReactNode =>
    factor.nodes.map((node, index) => (
      <span key={node}>
        {index === 0 ? null : CAPTION_JOIN}
        <SlotButton node={node} onShow={onShowSlot} />
      </span>
    ))
  return (
    <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
      {t.rich(factor.what, { nodes })}
    </Text>
  )
}

function useValueLabel(): (value: FactorValue, alone: boolean) => string {
  const t = useTranslations("research.experiment.what")
  return (value, alone) => {
    const nodes = nodesText(value.nodes)
    if (value.value === null) return alone ? t("asWritten") : t("nodeWrittenUnknown", { nodes })
    if (alone) return value.written ? t("writtenValue", { value: value.value }) : value.value
    return value.written ? t("nodeWritten", { nodes, value: value.value }) : t("nodeValue", { nodes, value: value.value })
  }
}

function ValueLink({ action, focus, children }: ValueLinkProps) {
  const t = useTranslations("research.experiment.what")
  if (action.kind === "none") return <>{children}</>
  if (action.kind === "canvas") {
    return (
      <Link to={ROUTE_PATH.canvas} params={{ flowId: action.flow }} aria-label={t("openCanvas", { flow: action.flow })} className={`inline-flex items-center gap-1 ${LINK_CLASS}`}>
        {children}
        <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    )
  }
  const onClick = (): void => {
    if (action.kind === "graph") focus.showGraph(action.key)
    if (action.kind === "block") focus.reveal(action.block)
  }
  return (
    <button type="button" className={LINK_CLASS} onClick={onClick}>
      {children}
    </button>
  )
}

function ValueCell({ what, variant, values, views, blocks, focus }: ValueCellProps) {
  const label = useValueLabel()
  const alone = values.length === 1
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {values.map((value) => (
        <li key={value.nodes.join()}>
          <Text role="cell" tone={value.written ? "neutral" : "default"} className="wrap-anywhere">
            <ValueLink action={valueAction(what, views, blocks, variant, value)} focus={focus}>
              {label(value, alone)}
            </ValueLink>
          </Text>
        </li>
      ))}
    </ul>
  )
}

function AgentsCell({ agents }: { readonly agents: readonly AgentModel[] }) {
  const t = useTranslations("research.experiment.what")
  if (agents.length === 0) return <Text role="cell" tone="neutral">{t("noModel")}</Text>
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {agents.map((item) => (
        <li key={item.agent} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <Text role="cell" tone="default">{item.agent}</Text>
          <Text role="meta" tone="neutral" title={item.model.full} className="wrap-anywhere">{item.model.short}</Text>
        </li>
      ))}
    </ul>
  )
}

function useFields(props: WhatWeTestProps, factor: ExperimentFactor | null, models: boolean): readonly MatrixField<VariantRow>[] {
  const what = useTranslations("research.experiment.what")
  const value: readonly MatrixField<VariantRow>[] =
    factor === null
      ? []
      : [{
          id: "value",
          label: what(`column.value.${factor.what}`),
          track: "minmax(0,2.2fr)",
          render: (row) => <ValueCell what={factor.what} variant={row.id} values={row.values} views={props.views} blocks={props.blocks} focus={props.focus} />,
        }]
  const agents: readonly MatrixField<VariantRow>[] = models
    ? [{ id: "models", label: what("column.models"), track: "minmax(0,1.4fr)", render: (row) => <AgentsCell agents={row.agents} /> }]
    : []
  return [
    {
      id: "variant",
      label: what("column.variant"),
      track: "minmax(0,1fr)",
      render: (row) => (
        <Text role="cell" tone="default" weight="semibold" className="wrap-anywhere">
          {row.id}
        </Text>
      ),
    },
    {
      id: "role",
      label: what("column.role"),
      track: "96px",
      render: (row) => <RowRoleTag role={row.role} size="xs" />,
    },
    ...value,
    ...agents,
  ]
}

function Changes({ factor, blocks, focus }: { readonly factor: ExperimentFactor | null; readonly blocks: readonly ChangeBlock[]; readonly focus: PageFocus }) {
  if (factor === null || !isBlockKind(factor.what)) return null
  return <WhatChanges what={factor.what} blocks={blocks} open={focus.open} onToggle={focus.toggle} onShowSlot={focus.showSlot} />
}

function VariantsTable(props: WhatWeTestProps) {
  const t = useTranslations("research.experiment.what")
  const table = variantTable(props.experiment)
  const fields = useFields(props, table.factor, table.models)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <FactorCaption factor={table.factor} onShowSlot={props.focus.showSlot} />
        <Surface variant="panel" className="overflow-hidden">
          <Matrix orientation="rows" rules="rows" label={t("tableAria")} items={table.rows} itemKey={(row) => row.id} fields={fields} />
        </Surface>
      </div>
      <Changes factor={table.factor} blocks={props.blocks} focus={props.focus} />
    </div>
  )
}

export function WhatWeTest(props: WhatWeTestProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <HypothesisCard experiment={props.experiment} />
      <VariantsTable {...props} />
      <ExperimentFacts experiment={props.experiment} />
    </div>
  )
}
