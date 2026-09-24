import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { SeriesSummary } from "@/domain"
import { Empty, EXECUTION_STATUS_TONE, Heading, Surface, Tag, Text } from "@/components/studio"
import * as ids from "@/data/ids"
import { InspectorPanel, PromptBody, SchemaBody, type InspectorPage } from "@/features/flow"
import { duration, joinMeta, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import type { NodeAgent, NodeFacts } from "./graph-model"
import { Failure, FactList } from "./layout"
import { seriesRef } from "./presenters"
import { useStepDescription } from "./use-step-description"
import { useStepPrompt } from "./use-step-prompt"
import { SAMPLED_ATTEMPTS, useStepResults, type StepRun, type VariantRuns } from "./use-step-results"

type StepTab = "agents" | "input" | "prompt" | "output" | "results"

export type StepInspectorProps = {
  readonly facts: NodeFacts
  readonly latest: SeriesSummary | null
  readonly onClose: () => void
}

const MS_PER_SECOND = 1000
const MIDDLE = 0.5

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

function AgentsBody({ facts }: { readonly facts: NodeFacts }) {
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

function PromptPage({ facts, raw }: { readonly facts: NodeFacts; readonly raw: boolean }) {
  const t = useTranslations("research.experiment.step")
  const state = useStepPrompt(facts.prompt)
  if (state.kind === "ready") return <PromptBody prompt={state.prompt} raw={raw} />
  if (state.kind === "failed") return <Failure message={t("promptFailed", { reason: state.message })} />
  if (state.kind === "loading") {
    return (
      <Text as="p" role="hint" tone="neutral" aria-live="polite">
        {t("promptLoading")}
      </Text>
    )
  }
  return <Empty title={t("noPrompt")} />
}

const median = (values: readonly number[]): number | null => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor((sorted.length - 1) * MIDDLE)] ?? null
}

function useRunsSummary(): (runs: readonly StepRun[]) => string {
  const t = useTranslations("research.experiment.step.results")
  return (runs) => {
    const latency = median(runs.flatMap((run) => (run.latencyMs === null ? [] : [run.latencyMs])))
    return joinMeta([
      t("ok", { ok: runs.filter((run) => run.status === "ok").length, total: runs.length }),
      latency === null ? null : t("latency", { value: duration(latency / MS_PER_SECOND) }),
      t("spend", { value: usd(runs.reduce((total, run) => total + run.usd, 0)) }),
    ])
  }
}

function RunRow({ run, node }: { readonly run: StepRun; readonly node: string }) {
  const t = useTranslations("research.experiment.step.results")
  const status = useTranslations("domain.executionStatus")
  return (
    <li className="flex min-w-0 flex-col gap-1 px-3 py-2.25">
      <div className="flex min-w-0 items-center gap-2">
        <Tag size="xs" tone={EXECUTION_STATUS_TONE[run.status]}>
          {status(run.status)}
        </Tag>
        <Text role="cell" tone="default" weight="medium" truncate title={run.caseName}>
          {t("attempt", { name: run.caseName, repeat: run.repeat })}
        </Text>
        <Text role="data" tone="neutral" className="ml-auto shrink-0">
          {joinMeta([run.latencyMs === null ? null : duration(run.latencyMs / MS_PER_SECOND), usd(run.usd)])}
        </Text>
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.run} params={{ runId: run.run }} search={{ node: ids.nodeId(node) }} aria-label={t("openRun", { name: run.caseName, repeat: run.repeat })} className="inline-flex shrink-0 items-center">
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </Text>
      </div>
      {run.summary === null ? null : (
        <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
          {run.summary}
        </Text>
      )}
    </li>
  )
}

function VariantBlock({ variant, node }: { readonly variant: VariantRuns; readonly node: string }) {
  const t = useTranslations("research.experiment.step.results")
  const summary = useRunsSummary()
  const empty = variant.runs.length === 0
  return (
    <section aria-label={variant.variant} className="flex min-w-0 flex-col gap-1.5">
      <Heading size="block" title={variant.variant} description={empty ? t("notRun") : summary(variant.runs)} />
      {empty ? null : (
        <Surface variant="panel" className="overflow-hidden">
          <ul className="divide-y divide-border">
            {variant.runs.map((run) => (
              <RunRow key={run.run} run={run} node={node} />
            ))}
          </ul>
        </Surface>
      )}
    </section>
  )
}

function ResultsPage({ latest, node }: { readonly latest: SeriesSummary | null; readonly node: string }) {
  const t = useTranslations("research.experiment.step.results")
  const state = useStepResults(latest, node)
  if (state.kind === "none") return <Empty title={t("none")} hint={t("noneHint")} />
  if (state.kind === "failed") return <Failure message={t("failed", { reason: state.message })} />
  if (state.kind === "loading") {
    return (
      <Text as="p" role="hint" tone="neutral" aria-live="polite">
        {t("loading")}
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <Text as="p" role="hint" tone="neutral">
          {t("intro", { count: SAMPLED_ATTEMPTS })}
        </Text>
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.series} params={{ seriesId: state.series }} className="inline-flex items-center gap-1">
            {t("openSeries", { ref: seriesRef(state.series) })}
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </Text>
      </div>
      {state.variants.map((variant) => (
        <VariantBlock key={variant.variant} variant={variant} node={node} />
      ))}
    </div>
  )
}

const hasPrompt = (facts: NodeFacts): boolean => facts.prompt.kind !== "none"

type SchemaTitles = { readonly inputs: string; readonly outputs: string }

type PageSpec = {
  readonly value: StepTab
  readonly shown: (facts: NodeFacts) => boolean
  readonly presentation: boolean
  readonly render: (props: StepInspectorProps, raw: boolean, titles: SchemaTitles) => ReactNode
}

const ALWAYS = (): boolean => true

const PAGES: readonly PageSpec[] = [
  { value: "agents", shown: ALWAYS, presentation: false, render: ({ facts }) => <AgentsBody facts={facts} /> },
  { value: "input", shown: ALWAYS, presentation: true, render: ({ facts }, raw, titles) => <SchemaBody id="step-input" title={titles.inputs} schema={facts.schemas?.in ?? null} raw={raw} /> },
  { value: "prompt", shown: hasPrompt, presentation: true, render: ({ facts }, raw) => <PromptPage facts={facts} raw={raw} /> },
  { value: "output", shown: ALWAYS, presentation: true, render: ({ facts }, raw, titles) => <SchemaBody id="step-output" title={titles.outputs} schema={facts.schemas?.out ?? null} raw={raw} allowedValues /> },
  { value: "results", shown: ALWAYS, presentation: false, render: ({ latest, facts }) => <ResultsPage latest={latest} node={facts.id} /> },
]

export function StepInspector(props: StepInspectorProps) {
  const t = useTranslations("research.experiment.step")
  const { facts, onClose } = props
  const description = useStepDescription(facts.description)
  const titles: SchemaTitles = { inputs: t("inputs"), outputs: t("outputs") }
  const pages: readonly InspectorPage<StepTab>[] = PAGES.filter((page) => page.shown(facts)).map((page) => ({
    value: page.value,
    label: t(`tabs.${page.value}`),
    presentation: page.presentation,
    render: (raw) => page.render(props, raw, titles),
  }))
  return (
    <InspectorPanel
      kind={facts.kind}
      title={facts.id}
      description={description}
      closeLabel={t("close")}
      tabsLabel={t("tabsAria")}
      pages={pages}
      onClose={onClose}
    />
  )
}
