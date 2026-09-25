import { useState } from "react"
import { cn } from "cn"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, ExperimentQuestion } from "@/domain"
import { Empty, SIDE_PANEL_WIDTH, Surface, Text } from "@/components/studio"
import { buildGraph, GraphCanvas, withFieldCounts } from "@/features/flow"
import { joinMeta } from "@/lib/format"
import { markSteps, type GraphView, type StepMark } from "./graph-model"
import { ResearchSection } from "./layout"
import { RoleTag } from "./role-tag"
import type { PageFocus } from "./use-page-focus"
import { graphAnchor, type ChangeBlock } from "./what-changes"
import { WhatWeTest } from "./what-we-test"

type GraphBlockProps = {
  readonly view: GraphView
  readonly question: ExperimentQuestion
  readonly selected: string | null
  readonly highlighted: boolean
  readonly legend: boolean
  readonly onSelect: (node: string) => void
  readonly onToggleLegend: () => void
}

export type ExperimentCanvasProps = {
  readonly experiment: ExperimentDetail
  readonly views: readonly GraphView[]
  readonly blocks: readonly ChangeBlock[]
  readonly focus: PageFocus
}

const MARK_JOIN = " · "

function useMarkLabel(): (mark: StepMark) => string {
  const t = useTranslations("research.experiment.canvas")
  const factor = useTranslations("research.vocabulary.factor")
  return (mark) => {
    if (mark.kind === "swap") return t("swap", { agents: mark.agents })
    if (mark.values.length === 0) return t("factorWritten", { what: factor(mark.what) })
    return t("factor", { what: factor(mark.what), values: mark.values.join(MARK_JOIN) })
  }
}

function GraphTitle({ view, question }: { readonly view: GraphView; readonly question: ExperimentQuestion }) {
  const t = useTranslations("research.experiment.canvas")
  const { source } = view
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {view.variants.map((variant) => (
        <span key={variant.id} className="flex min-w-0 items-center gap-1.5">
          <Text role="block" tone="default" weight="semibold">
            {variant.id}
          </Text>
          <RoleTag variant={variant.id} role={variant.role} question={question} />
        </span>
      ))}
      <Text role="hint" tone="neutral">
        {joinMeta([view.role === "subject" ? t("subject") : null, source.local ? t("localFlow", { flow: source.flow }) : t("flow", { flow: source.flow })])}
      </Text>
    </div>
  )
}

function GraphBlock({ view, question, selected, highlighted, legend, onSelect, onToggleLegend }: GraphBlockProps) {
  const t = useTranslations("research.experiment.canvas")
  const label = useMarkLabel()
  const graph = withFieldCounts(markSteps(buildGraph(view.source.nodes, view.source.order), view.marks, label), view.source.schemas)
  return (
    <section
      id={graphAnchor(view.source.key)}
      aria-label={t("graphAria", { graph: view.source.key })}
      data-highlighted={highlighted}
      className="flex min-w-0 scroll-mt-4 flex-col gap-2"
    >
      <GraphTitle view={view} question={question} />
      <Surface variant="panel" className={cn("relative h-80 overflow-hidden", highlighted && "ring-2 ring-ring")}>
        <GraphCanvas
          graph={graph}
          selected={selected}
          legend={legend}
          dimmed={view.dimmed}
          pageScroll
          fitSpace="tight"
          focusInset={SIDE_PANEL_WIDTH}
          onSelect={onSelect}
          onToggleLegend={onToggleLegend}
        />
      </Surface>
    </section>
  )
}

function Graphs({ experiment, views, focus }: ExperimentCanvasProps) {
  const t = useTranslations("research.experiment.canvas")
  const [legend, setLegend] = useState(false)
  if (views.length === 0) return <Empty title={t("noGraph")} />
  return (
    <div className="mt-2 flex min-w-0 flex-col gap-2">
      <Text as="p" role="hint" tone="neutral">
        {t("hint")}
      </Text>
      <div className="flex min-w-0 flex-col gap-5">
        {views.map((item) => (
          <GraphBlock
            key={item.source.key}
            view={item}
            question={experiment.question}
            selected={focus.selection?.graph === item.source.key ? focus.selection.node : null}
            highlighted={focus.graph === item.source.key}
            legend={legend}
            onSelect={(node) => {
              focus.select({ graph: item.source.key, node })
            }}
            onToggleLegend={() => {
              setLegend((open) => !open)
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function ExperimentCanvas(props: ExperimentCanvasProps) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <ResearchSection title={t("title")}>
      <WhatWeTest experiment={props.experiment} views={props.views} blocks={props.blocks} focus={props.focus} />
      <Graphs {...props} />
    </ResearchSection>
  )
}
