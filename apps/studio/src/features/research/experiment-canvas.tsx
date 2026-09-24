import { useState } from "react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, ExperimentQuestion } from "@/domain"
import { Empty, SIDE_PANEL_WIDTH, Surface, Text } from "@/components/studio"
import { buildGraph, GraphCanvas, withFieldCounts } from "@/features/flow"
import { markSwaps, type GraphView, type StepSelection } from "./graph-model"
import { ResearchSection } from "./layout"
import { RoleTag } from "./role-tag"
import { WhatWeTest } from "./what-we-test"

type GraphBlockProps = {
  readonly view: GraphView
  readonly question: ExperimentQuestion
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

function GraphTitle({ view, question }: { readonly view: GraphView; readonly question: ExperimentQuestion }) {
  const t = useTranslations("research.experiment.canvas")
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
          fitSpace="tight"
          focusInset={SIDE_PANEL_WIDTH}
          onSelect={onSelect}
          onToggleLegend={onToggleLegend}
        />
      </Surface>
    </section>
  )
}

function Graphs({ experiment, views, selection, onSelect }: ExperimentCanvasProps) {
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
    </div>
  )
}

export function ExperimentCanvas(props: ExperimentCanvasProps) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <ResearchSection title={t("title")}>
      <WhatWeTest experiment={props.experiment} />
      <Graphs {...props} />
    </ResearchSection>
  )
}
