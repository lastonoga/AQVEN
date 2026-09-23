import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ExperimentCheck, ExperimentDetail, QuestionKind } from "@/domain"
import { Empty, NODE_KIND, SidePanel, Surface, Tag, Text } from "@/components/studio"
import { buildGraph, GraphCanvas } from "@/features/flow"
import { ROUTE_PATH } from "@/lib/routes"
import { graphViews, markSwaps, nodeFacts, type GraphView, type NodeAgent, type NodeFacts, type SubjectGraph } from "./graph-model"
import { FactList, ResearchSection } from "./layout"
import { tagPairs } from "./presenters"
import { RoleTag } from "./role-tag"

type Selection = { readonly graph: string; readonly node: string }

type GraphBlockProps = {
  readonly view: GraphView
  readonly question: QuestionKind
  readonly selected: string | null
  readonly legend: boolean
  readonly onSelect: (node: string) => void
  readonly onToggleLegend: () => void
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
  const graph = markSwaps(buildGraph(view.source.nodes, view.source.order), view.swaps, (agents) => t("swap", { agents }))
  return (
    <section aria-label={t("graphAria", { graph: view.source.key })} className="flex min-w-0 flex-col gap-1.5">
      <GraphTitle view={view} question={question} />
      <Surface variant="panel" className="relative h-80 overflow-hidden">
        <GraphCanvas graph={graph} selected={selected} legend={legend} dimmed={view.dimmed} pageScroll onSelect={onSelect} onToggleLegend={onToggleLegend} />
      </Surface>
    </section>
  )
}

function AgentValue({ agent }: { readonly agent: NodeAgent }) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <>
      <Text role="cell" tone={agent.agent === null ? "neutral" : "default"} weight="semibold">
        {agent.agent ?? t("noAgent")}
      </Text>
      {agent.model === null ? null : (
        <Text role="data" tone="neutral" className="wrap-anywhere">
          {agent.model}
        </Text>
      )}
      {agent.overridden ? (
        <Tag size="micro" fill="tint" tone="llm">
          {t("overridden")}
        </Tag>
      ) : null}
    </>
  )
}

function NodeBody({ facts }: { readonly facts: NodeFacts }) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <div className="flex flex-col gap-3">
      {facts.outside ? (
        <Text as="p" role="hint" tone="neutral">
          {t("outside")}
        </Text>
      ) : null}
      <FactList facts={facts.agents.map((agent) => ({ id: agent.variant, label: agent.variant, value: <AgentValue agent={agent} /> }))} />
    </div>
  )
}

function NodeDrawer({ facts, onClose }: { readonly facts: NodeFacts | null; readonly onClose: () => void }) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <SidePanel
      open={facts !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={facts?.id ?? ""}
      description={facts?.description ?? null}
      leading={
        facts === null ? null : (
          <Tag size="sm" tone={NODE_KIND[facts.kind].tone}>
            {NODE_KIND[facts.kind].code}
          </Tag>
        )
      }
      closeLabel={t("close")}
    >
      {facts === null ? null : <NodeBody facts={facts} />}
    </SidePanel>
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

function Graphs({ experiment, views }: { readonly experiment: ExperimentDetail; readonly views: readonly GraphView[] }) {
  const t = useTranslations("research.experiment.canvas")
  const [selection, setSelection] = useState<Selection | null>(null)
  const [legend, setLegend] = useState(false)
  if (views.length === 0) return <Empty title={t("noGraph")} />
  const view = views.find((item) => item.source.key === selection?.graph)
  const facts = view === undefined || selection === null ? null : nodeFacts(experiment, view, selection.node)
  return (
    <div className="relative flex min-w-0 flex-col gap-4">
      {views.map((item) => (
        <GraphBlock
          key={item.source.key}
          view={item}
          question={experiment.question.kind}
          selected={selection?.graph === item.source.key ? selection.node : null}
          legend={legend}
          onSelect={(node) => {
            setSelection({ graph: item.source.key, node })
          }}
          onToggleLegend={() => {
            setLegend((open) => !open)
          }}
        />
      ))}
      <NodeDrawer
        facts={facts}
        onClose={() => {
          setSelection(null)
        }}
      />
    </div>
  )
}

export function ExperimentCanvas({ experiment, graphs }: { readonly experiment: ExperimentDetail; readonly graphs: readonly SubjectGraph[] }) {
  const t = useTranslations("research.experiment.canvas")
  return (
    <ResearchSection title={t("title")} description={t("hint")}>
      <Graphs experiment={experiment} views={graphViews(experiment, graphs)} />
      <CasesLine experiment={experiment} />
      <ChecksLine checks={experiment.checks} />
    </ResearchSection>
  )
}
