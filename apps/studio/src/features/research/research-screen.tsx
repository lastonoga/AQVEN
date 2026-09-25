import { useId, useMemo, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { useLocale, useNow, useTranslations } from "use-intl"
import type { ExperimentFilter, ExperimentSummary, FlowId } from "@/domain"
import { Dot, Empty, Expander, Heading, Matrix, Page, RowLink, Surface, Tag, Text, Toolbar, type MatrixField } from "@/components/studio"
import { HandoffButton } from "@/features/chat-handoff"
import { relativeTime } from "@/i18n/format"
import { projectRouteApi, researchRouteApi, ROUTE_PATH } from "@/lib/routes"
import { useFlowTitle, useSubjectCopy } from "./copy"
import { layoutExperiments, localDayStart, type ActivityGroup, type Grouping, type ListSection } from "./experiment-groups"
import { ResearchSection } from "./layout"
import { experimentRows, failureModes, hasNarrowing, withFilter, type ExperimentRow, type ListCopy } from "./presenters"
import { ResearchFilters } from "./research-filters"
import { useSeenMark } from "./use-seen-mark"
import { isNewSince, rememberedGrouping, rememberGrouping, type SeenMarks } from "./viewer-memory"

const TABLE_MIN_WIDTH = 866
const WRAPPED = "line-clamp-2 wrap-anywhere"
const MINUTE_MS = 60_000
const HEADING_LINK = "rounded-xs outline-none underline-offset-3 hover:underline focus-visible:ring-2 focus-visible:ring-ring"

type HypothesesScope = { readonly experiments: readonly ExperimentSummary[]; readonly filter: ExperimentFilter }

type ListView = { readonly scope: HypothesesScope; readonly seen: SeenMarks | null; readonly now: Date }

type SectionHead = { readonly title: string; readonly heading: ReactNode; readonly trailing: ReactNode }

const hypothesesPrompt = ({ experiments, filter }: HypothesesScope, flow: FlowId | null) => (): string =>
  [
    "Suggest hypotheses worth testing in this project.",
    `Read flows/, the cases of each flow and the experiments already in experiments/: ${experiments.map((item) => item.id).join(", ") || "none yet"}.`,
    flow === null ? null : `Focus on the flow ${flow}.`,
    filter.failureMode === undefined ? null : `Focus on the failure mode ${filter.failureMode}.`,
    "For each hypothesis give the failure_mode it targets, the question (look, threshold, compare or noninferior) with its metric and margin, the subject (a flow or a range of it), the one factor the variants change (varies: agent, prompt, use or flow) with its nodes, the variants as values of that factor, the checks and the cases by tags.",
    "Do not write files yet: I will pick one, then you write experiments/<experiment_id>/experiment.yaml and run aqven check.",
  ]
    .filter((line) => line !== null)
    .join("\n")

function useListCopy(now: Date): ListCopy {
  const t = useTranslations("research")
  const locale = useLocale()
  const subject = useSubjectCopy()
  return {
    subject,
    verdict: (state) => t(`vocabulary.verdict.${state}`),
    status: (status) => t(`vocabulary.status.${status}`),
    split: (split) => t(`vocabulary.splitShort.${split}`),
    series: (count) => t("list.series", { count }),
    spent: (amount) => t("list.spent", { amount }),
    activity: (source, at) => t(`list.activity.${source}`, { when: relativeTime(at, now, locale, "narrow") }),
    attention: (reason) => t(`list.attention.${reason}`),
  }
}

function ExperimentCell({ row }: { readonly row: ExperimentRow }) {
  const t = useTranslations("research.list")
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        {row.fresh ? <Dot tone="success" size="sm" label={t("new")} /> : null}
        <Text as="div" role="cell" tone="default" weight="semibold" truncate>
          {row.id}
        </Text>
        {row.activity === null ? null : (
          <Text role="caption" tone="neutral" className="ml-auto shrink-0 whitespace-nowrap pl-2">
            {row.activity}
          </Text>
        )}
      </div>
      {row.attention === null ? null : (
        <Text as="div" role="caption" tone="warning" className="wrap-anywhere">
          {row.attention}
        </Text>
      )}
      <Text as="div" role="caption" tone="neutral" className={WRAPPED} title={row.description}>
        {row.description}
      </Text>
    </div>
  )
}

function useExperimentFields(): readonly MatrixField<ExperimentRow>[] {
  const t = useTranslations("research")
  return [
    {
      id: "experiment",
      label: t("list.column.experiment"),
      track: "minmax(240px,1.7fr)",
      render: (row) => <ExperimentCell row={row} />,
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
      track: "minmax(140px,1.1fr)",
      render: (row) => (
        <Text as="div" role="cell" className={WRAPPED} title={row.subject}>
          {row.subject}
        </Text>
      ),
    },
    {
      id: "variants",
      label: t("list.column.variants"),
      track: "minmax(140px,1.2fr)",
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

function ExperimentTable({ experiments, label, view }: { readonly experiments: readonly ExperimentSummary[]; readonly label: string; readonly view: ListView }) {
  const t = useTranslations("research.list")
  const copy = useListCopy(view.now)
  const fields = useExperimentFields()
  const rows = experimentRows(experiments, copy, (experiment) => isNewSince(experiment, view.seen))
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

function useSectionHead(scope: HypothesesScope): (section: ListSection) => SectionHead {
  const t = useTranslations("research.list")
  const flowTitle = useFlowTitle()
  const activityHead = (group: ActivityGroup): SectionHead => ({
    title: t(`group.${group}`),
    heading: <span title={t(`groupHint.${group}`)}>{t(`group.${group}`)}</span>,
    trailing: null,
  })
  const flowHead = (flow: FlowId | null): SectionHead => {
    const title = flowTitle(flow)
    const heading =
      flow === null ? title : (
        <Link to={ROUTE_PATH.canvas} params={{ flowId: flow }} aria-label={t("openFlow", { flow })} className={HEADING_LINK}>
          {title}
        </Link>
      )
    return { title, heading, trailing: sectionSuggest(t("suggest"), scope, flow) }
  }
  const modeHead = (mode: string | null): SectionHead => {
    if (mode === null) return { title: t("group.noFailureMode"), heading: t("group.noFailureMode"), trailing: null }
    const heading = (
      <Link to={ROUTE_PATH.research} search={withFilter(scope.filter, { failureMode: mode })} aria-label={t("filterMode", { mode })} className={HEADING_LINK}>
        {mode}
      </Link>
    )
    return { title: mode, heading, trailing: null }
  }
  return (section) => {
    if (section.kind === "activity") return activityHead(section.group)
    if (section.kind === "flow") return flowHead(section.flow)
    return modeHead(section.mode)
  }
}

function OpenSection({ section, view }: { readonly section: ListSection; readonly view: ListView }) {
  const t = useTranslations("research.list")
  const head = useSectionHead(view.scope)(section)
  return (
    <ResearchSection title={head.title} heading={head.heading} description={t("count", { count: section.items.length })} trailing={head.trailing}>
      <ExperimentTable experiments={section.items} label={t("tableAria", { section: head.title })} view={view} />
    </ResearchSection>
  )
}

type CollapsedKind = "older" | "archived"

function CollapsedSection({ kind, experiments, view }: { readonly kind: CollapsedKind; readonly experiments: readonly ExperimentSummary[]; readonly view: ListView }) {
  const t = useTranslations("research.list")
  const id = useId()
  const [open, setOpen] = useState(false)
  if (experiments.length === 0) return null
  const title = t(`group.${kind}`, { count: experiments.length })
  return (
    <section aria-label={title} className="flex min-w-0 flex-col items-start gap-3">
      <Expander
        open={open}
        controls={id}
        label={title}
        size="sm"
        onClick={() => {
          setOpen((current) => !current)
        }}
      />
      {open ? (
        <div id={id} className="w-full min-w-0">
          <ExperimentTable experiments={experiments} label={t("tableAria", { section: title })} view={view} />
        </div>
      ) : null}
    </section>
  )
}

function ExperimentSections({ experiments, grouping, view }: { readonly experiments: readonly ExperimentSummary[]; readonly grouping: Grouping; readonly view: ListView }) {
  const t = useTranslations("research.list")
  if (experiments.length === 0) return <Empty title={hasNarrowing(view.scope.filter) ? t("empty") : t("emptyAll")} hint={t("emptyHint")} />
  const layout = layoutExperiments(experiments, grouping, localDayStart(view.now))
  return (
    <div className="flex min-w-0 flex-col gap-7">
      {layout.open.map((section) => (
        <OpenSection key={section.key} section={section} view={view} />
      ))}
      <CollapsedSection key={`${grouping}:older`} kind="older" experiments={layout.older} view={view} />
      <CollapsedSection key="archived" kind="archived" experiments={layout.archived} view={view} />
    </div>
  )
}

export function ResearchScreen() {
  const t = useTranslations("research.list")
  const { project } = projectRouteApi.useLoaderData()
  const { experiments, all, filter } = researchRouteApi.useLoaderData()
  const [grouping, setGrouping] = useState<Grouping>(rememberedGrouping)
  const now = useNow({ updateInterval: MINUTE_MS })
  const visible = useMemo(() => layoutExperiments(experiments, grouping, localDayStart(now)).open.flatMap((section) => section.items), [experiments, grouping, now])
  const seen = useSeenMark(project.root, visible)
  const scope: HypothesesScope = { experiments: all, filter }
  const choose = (next: Grouping): void => {
    setGrouping(next)
    rememberGrouping(next)
  }
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
        <ResearchFilters filter={filter} failureModes={failureModes(all)} count={experiments.length} grouping={grouping} onGroupingChange={choose} />
        <ExperimentSections experiments={experiments} grouping={grouping} view={{ scope, seen, now }} />
      </div>
    </Page>
  )
}
