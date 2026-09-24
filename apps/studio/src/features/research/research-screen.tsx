import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ExperimentFilter, ExperimentSummary, FlowId } from "@/domain"
import { Empty, Heading, Matrix, Page, RowLink, Surface, Tag, Text, Toolbar, type MatrixField } from "@/components/studio"
import { HandoffButton } from "@/features/chat-handoff"
import { projectRouteApi, researchRouteApi, ROUTE_PATH } from "@/lib/routes"
import { useFlowTitle, useSubjectCopy } from "./copy"
import { experimentFlow, flowGroupKey, groupByFlow, type FlowGroup } from "./flow-groups"
import { ResearchSection } from "./layout"
import { experimentRows, failureModes, hasNarrowing, type ExperimentRow, type ListCopy } from "./presenters"
import { ResearchFilters } from "./research-filters"

const TABLE_MIN_WIDTH = 866
const WRAPPED = "line-clamp-2 wrap-anywhere"

type HypothesesScope = { readonly experiments: readonly ExperimentSummary[]; readonly filter: ExperimentFilter }

const hypothesesPrompt = ({ experiments, filter }: HypothesesScope, flow: FlowId | null) => (): string =>
  [
    "Suggest hypotheses worth testing in this project.",
    `Read flows/, the cases of each flow and the experiments already in experiments/: ${experiments.map((item) => item.id).join(", ") || "none yet"}.`,
    flow === null ? null : `Focus on the flow ${flow}.`,
    filter.failureMode === undefined ? null : `Focus on the failure mode ${filter.failureMode}.`,
    "For each hypothesis give the failure_mode it targets, the question (look, threshold, compare or noninferior) with its metric and margin, the subject (flow, range or arm), the variants as agents from agents/, the checks and the cases by tags.",
    "Do not write files yet: I will pick one, then you write experiments/<experiment_id>/experiment.yaml and run aqven check.",
  ]
    .filter((line) => line !== null)
    .join("\n")

function useListCopy(): ListCopy {
  const t = useTranslations("research")
  const subject = useSubjectCopy()
  return {
    subject,
    verdict: (state) => t(`vocabulary.verdict.${state}`),
    status: (status) => t(`vocabulary.status.${status}`),
    split: (split) => t(`vocabulary.splitShort.${split}`),
    series: (count) => t("list.series", { count }),
    spent: (amount) => t("list.spent", { amount }),
  }
}

function useExperimentFields(): readonly MatrixField<ExperimentRow>[] {
  const t = useTranslations("research")
  return [
    {
      id: "experiment",
      label: t("list.column.experiment"),
      track: "minmax(200px,1.5fr)",
      render: (row) => (
        <div className="min-w-0">
          <Text as="div" role="cell" tone="default" weight="semibold" truncate>
            {row.id}
          </Text>
          <Text as="div" role="caption" tone="neutral" className={WRAPPED} title={row.description}>
            {row.description}
          </Text>
        </div>
      ),
    },
    {
      id: "question",
      label: t("list.column.question"),
      track: "84px",
      render: (row) => (
        <Tag size="xs" tone="neutral" fill="outline">
          {t(`vocabulary.question.${row.question}`)}
        </Tag>
      ),
    },
    {
      id: "subject",
      label: t("list.column.subject"),
      track: "minmax(140px,1.2fr)",
      render: (row) => (
        <Text as="div" role="cell" className={WRAPPED} title={row.subject}>
          {row.subject}
        </Text>
      ),
    },
    {
      id: "variants",
      label: t("list.column.variants"),
      track: "minmax(140px,1.4fr)",
      render: (row) => (
        <Text as="div" role="cell" className={WRAPPED} title={row.variants}>
          {row.variants}
        </Text>
      ),
    },
    {
      id: "verdict",
      label: t("list.column.verdict"),
      track: "minmax(112px,0.6fr)",
      render: (row) =>
        row.latest === null ? (
          <Text role="cell" tone="neutral">
            —
          </Text>
        ) : (
          <Tag size="xs" wrap tone={row.latest.tone} detail={row.latest.detail}>
            {row.latest.label}
          </Tag>
        ),
    },
    {
      id: "series",
      label: t("list.column.series"),
      track: "104px",
      align: "end",
      render: (row) => (
        <Text as="div" role="cell" tone="neutral">
          {row.series}
        </Text>
      ),
    },
  ]
}

function ExperimentTable({ experiments, label }: { readonly experiments: readonly ExperimentSummary[]; readonly label: string }) {
  const t = useTranslations("research.list")
  const copy = useListCopy()
  const fields = useExperimentFields()
  const rows = experimentRows(experiments, copy)
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        rules="rows"
        label={label}
        minWidth={TABLE_MIN_WIDTH}
        items={rows}
        itemKey={(row) => row.id}
        fields={fields}
        rowLink={(row) => <RowLink to={ROUTE_PATH.experiment} params={{ experimentId: row.id }} aria-label={t("open", { id: row.id })} />}
      />
    </Surface>
  )
}

const sectionSuggest = (label: string, scope: HypothesesScope, flow: FlowId | null): ReactNode => {
  if (flow === null) return null
  return <HandoffButton label={label} prompt={hypothesesPrompt(scope, flow)} variant="ghost" />
}

function ExperimentSection({ group, scope }: { readonly group: FlowGroup<ExperimentSummary>; readonly scope: HypothesesScope }) {
  const t = useTranslations("research.list")
  const title = useFlowTitle()(group.flow)
  return (
    <ResearchSection title={title} description={t("count", { count: group.items.length })} trailing={sectionSuggest(t("suggest"), scope, group.flow)}>
      <ExperimentTable experiments={group.items} label={t("tableAria", { section: title })} />
    </ResearchSection>
  )
}

function ExperimentSections({ experiments, scope }: { readonly experiments: readonly ExperimentSummary[]; readonly scope: HypothesesScope }) {
  const t = useTranslations("research.list")
  if (experiments.length === 0) return <Empty title={hasNarrowing(scope.filter) ? t("empty") : t("emptyAll")} hint={t("emptyHint")} />
  return (
    <div className="flex min-w-0 flex-col gap-7">
      {groupByFlow(experiments, experimentFlow).map((group) => (
        <ExperimentSection key={flowGroupKey(group)} group={group} scope={scope} />
      ))}
    </div>
  )
}

export function ResearchScreen() {
  const t = useTranslations("research.list")
  const { project } = projectRouteApi.useLoaderData()
  const { experiments, all, filter } = researchRouteApi.useLoaderData()
  const scope: HypothesesScope = { experiments: all, filter }
  return (
    <Page
      width="xl"
      header={
        <Toolbar wrap className="items-start gap-2.5" end={<HandoffButton label={t("suggest")} prompt={hypothesesPrompt(scope, null)} variant="default" />}>
          <Heading size="page" title={t("title")} below={[t("subtitle", { project: project.package ?? project.root })]} />
        </Toolbar>
      }
    >
      <div className="flex flex-col gap-5">
        <ResearchFilters filter={filter} failureModes={failureModes(all)} count={experiments.length} />
        <ExperimentSections experiments={experiments} scope={scope} />
      </div>
    </Page>
  )
}
