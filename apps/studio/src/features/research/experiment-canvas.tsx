import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ExperimentCheck, ExperimentDetail, QuestionKind } from "@/domain"
import { Empty, SIDE_PANEL_WIDTH, Surface, Text } from "@/components/studio"
import { buildGraph, GraphCanvas, withFieldCounts } from "@/features/flow"
import { ROUTE_PATH } from "@/lib/routes"
import { markSwaps, type GraphView, type StepSelection } from "./graph-model"
import { ResearchSection } from "./layout"
import { tagPairs } from "./presenters"
import { RoleTag } from "./role-tag"

type GraphBlockProps = {
  readonly view: GraphView
  readonly question: QuestionKind
  readonly selected: string | null
  readonly legend: boolean
  readonly onSelect: (node: string) => void
  readonly onToggleLegend: () => void
}

export type ExperimentCanvasProps = {
  readonly experiment: ExperimentDetail
  readonly views: readonly GraphView[]
  readonly selection: StepSelection | null
  readonly onSelect: (selection: StepSelection) => void
}

const LIST_JOIN = ", "

function GraphTitle({ view, question }: { readonly view: GraphView; readonly question: QuestionKind }) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {view.variants.map((variant) => (
        <span key={variant.id} className="flex min-w-0 items-center gap-1.5">
          <Text role="block" tone="default" weight="semibold">
            {variant.id}
          </Text>
          <RoleTag role={variant.role} question={question} />
        </span>
      ))}
      <Text role="hint" tone="neutral">
        {view.source.arm === null ? t("flow", { flow: view.source.key }) : t("arm", { arm: view.source.arm })}
      </Text>
    </div>
  )
}

function GraphBlock({ view, question, selected, legend, onSelect, onToggleLegend }: GraphBlockProps) {
  const t = useTranslations("research.experiment.canvas")
  const graph = withFieldCounts(markSwaps(buildGraph(view.source.nodes, view.source.order), view.swaps, (agents) => t("swap", { agents })), view.source.schemas)
  return (
    <section aria-label={t("graphAria", { graph: view.source.key })} className="flex min-w-0 flex-col gap-2">
      <GraphTitle view={view} question={question} />
      <Surface variant="panel" className="relative h-80 overflow-hidden">
        <GraphCanvas
          graph={graph}
          selected={selected}
          legend={legend}
          dimmed={view.dimmed}
          pageScroll
          focusInset={SIDE_PANEL_WIDTH}
          onSelect={onSelect}
          onToggleLegend={onToggleLegend}
        />
      </Surface>
    </section>
  )
}

function useCheckWords(): (check: ExperimentCheck) => string {
  const t = useTranslations("research.experiment.canvas.check")
  return ({ id, source }) => {
    if (source.kind !== "judge") return t(source.kind, { id })
    if (source.validatedBy === null) return t("judgeUnvalidated", { id })
    return t("judgeValidated", { id, by: source.validatedBy })
  }
}

function CasesLine({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.canvas")
  const { cases } = experiment
  const pairs = tagPairs(cases.tags)
  const flowId = cases.flow ?? experiment.flow
  const text = t("cases", {
    selected: cases.selected,
    total: cases.total,
    dataset: cases.dataset,
    tags: pairs.length === 0 ? t("anyTag") : t("tagged", { tags: pairs.join(LIST_JOIN) }),
    dev: cases.splits.dev,
    holdout: cases.splits.holdout,
  })
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <Text role="body" tone="default">
        {text}
      </Text>
      {flowId === null ? null : (
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.cases} params={{ flowId }} search={{ dataset: cases.dataset, ...(pairs.length === 0 ? {} : { tag: pairs }) }} className="inline-flex items-center gap-1">
            {t("openCases")}
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </Text>
      )}
    </div>
  )
}

function ChecksLine({ checks }: { readonly checks: readonly ExperimentCheck[] }) {
  const t = useTranslations("research.experiment.canvas")
  const words = useCheckWords()
  return (
    <Text as="p" role="body" tone="default">
      {checks.length === 0 ? t("noChecks") : t("checks", { list: checks.map(words).join(LIST_JOIN) })}
    </Text>
  )
}

function Graphs({ experiment, views, selection, onSelect }: ExperimentCanvasProps) {
  const t = useTranslations("research.experiment.canvas")
  const [legend, setLegend] = useState(false)
  if (views.length === 0) return <Empty title={t("noGraph")} />
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {views.map((item) => (
        <GraphBlock
          key={item.source.key}
          view={item}
          question={experiment.question.kind}
          selected={selection?.graph === item.source.key ? selection.node : null}
          legend={legend}
          onSelect={(node) => {
            onSelect({ graph: item.source.key, node })
          }}
          onToggleLegend={() => {
            setLegend((open) => !open)
          }}
        />
      ))}
    </div>
  )
}

export function ExperimentCanvas(props: ExperimentCanvasProps) {
  const t = useTranslations("research.experiment.canvas")
  const { experiment } = props
  return (
    <ResearchSection title={t("title")} description={t("hint")}>
      <Graphs {...props} />
      <CasesLine experiment={experiment} />
      <ChecksLine checks={experiment.checks} />
    </ResearchSection>
  )
}
