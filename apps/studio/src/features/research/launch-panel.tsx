import { Fragment, useId, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { Check, Square } from "lucide-react"
import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type ExperimentDetail, type LaunchPlan, type LaunchRequest, type SeriesSplit, type SeriesSummary } from "@/domain"
import { Actions, ChoiceGroup, NumberStepper, Surface, Tag, Text, type ActionSpec, type TextTone } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { SEPARATOR, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useReasonCopy } from "./copy"
import { ResearchSection } from "./layout"
import { activeSeries, launchReason, MAX_REPEATS, plannedAttempts, plannedCases, seriesRef, shortfallOf, type LaunchProblem, type ReasonCopy } from "./presenters"
import { RunButton } from "./run-button"
import { isSpendPause } from "./series-presenters"
import { SpendPause } from "./spend-pause"
import { SERIES_STATUS_TONE } from "./tones"
import { shownPlan, type PlanState } from "./use-launch-plan"
import type { Launch } from "./use-launch"
import type { ResearchAction } from "./use-research-action"

export type LaunchPanelProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly launch: Launch
}

type LaunchCopy = Translator<"research.experiment.launch">

type Notice = { readonly id: string; readonly tone: TextTone; readonly text: string; readonly title?: string | undefined }

type FieldRowProps = { readonly label: string; readonly htmlFor?: string; readonly children: ReactNode }

type FigureProps = { readonly template: string; readonly children: ReactNode }

const MIN_COUNT = 1
const COUNT_TEMPLATE = "00"

const problemsOf = (launch: Launch): readonly LaunchProblem[] => (launch.check.kind === "invalid" ? launch.check.problems : [])

const problemNotice = (problem: LaunchProblem, available: number, t: LaunchCopy): Notice => ({
  id: problem,
  tone: "destructive",
  text: problem === "cases" ? t("casesInvalid", { available }) : t("repeatsInvalid", { max: MAX_REPEATS }),
})

const recommendationNotice = (plan: LaunchPlan, experiment: ExperimentDetail, t: LaunchCopy, reasons: ReasonCopy): Notice => {
  const reason = launchReason(plan, experiment.metrics, reasons)
  const shortfall = shortfallOf(plan)
  if (shortfall === null) return { id: "recommendation", tone: "neutral", text: reason }
  return { id: shortfall, tone: "warning", text: t(shortfall, { recommended: plan.recommended.cases, available: plan.available }), title: reason }
}

const recommendationNotices = (plan: LaunchPlan | null, experiment: ExperimentDetail, t: LaunchCopy, reasons: ReasonCopy): readonly Notice[] => {
  if (plan === null || plan.recommended.reason === "look") return []
  return [recommendationNotice(plan, experiment, t, reasons)]
}

const noticesOf = (launch: Launch, experiment: ExperimentDetail, t: LaunchCopy, reasons: ReasonCopy): readonly Notice[] => {
  const problems = problemsOf(launch)
  if (problems.length > 0) return problems.map((problem) => problemNotice(problem, launch.available, t))
  return recommendationNotices(shownPlan(launch.plan), experiment, t, reasons)
}

function FieldRow({ label, htmlFor, children }: FieldRowProps) {
  return (
    <>
      <Text role="hint" tone="neutral" asChild>
        <label htmlFor={htmlFor}>{label}</label>
      </Text>
      <div className="flex min-w-0 items-center gap-2.5">{children}</div>
    </>
  )
}

function Figure({ template, children }: FigureProps) {
  return (
    <span data-template={template} className="inline-grid justify-items-end tabular-nums before:invisible before:col-start-1 before:row-start-1 before:content-[attr(data-template)]">
      <span className="col-start-1 row-start-1">{children}</span>
    </span>
  )
}

function NoticeLine({ id, notices }: { readonly id: string; readonly notices: readonly Notice[] }) {
  return (
    <Text id={id} as="p" role="hint" tone="neutral" aria-live="polite" truncate className="min-h-[1lh]">
      {notices.map((notice, index) => (
        <Fragment key={notice.id}>
          {index === 0 ? null : SEPARATOR}
          <Text role="hint" tone={notice.tone} title={notice.title}>
            {notice.text}
          </Text>
        </Fragment>
      ))}
    </Text>
  )
}

function Attempts({ count }: { readonly count: number | null }) {
  const t = useTranslations("research.experiment.launch")
  if (count === null) return <>{t("none")}</>
  return (
    <>
      <Figure template={COUNT_TEMPLATE}>{count}</Figure> {t("attempts", { count })}
    </>
  )
}

function Shape({ request, variants }: { readonly request: LaunchRequest | null; readonly variants: number }) {
  const t = useTranslations("research.experiment.launch")
  if (request === null) return null
  return (
    <>
      {SEPARATOR}
      {t("shape", { cases: request.cases, repeats: request.repeats, variants })}
    </>
  )
}

function Cap({ plan, stale }: { readonly plan: LaunchPlan; readonly stale: boolean }) {
  const t = useTranslations("research.experiment.launch")
  return (
    <span aria-busy={stale} className={cn("transition-opacity", stale && "opacity-45")}>
      {SEPARATOR}
      <Text role="meta" tone={plan.needsApproval ? "warning" : "neutral"}>
        {t(plan.needsApproval ? "approval" : "cap", { cap: usd(plan.capUsd) })}
      </Text>
    </span>
  )
}

function CapState({ state }: { readonly state: PlanState }) {
  const t = useTranslations("research.experiment.launch")
  if (state.kind === "ready") return <Cap plan={state.plan} stale={false} />
  if (state.kind === "loading" && state.stale !== null) return <Cap plan={state.stale} stale />
  if (state.kind === "failed") return <Text role="meta" tone="destructive">{SEPARATOR}{t("planFailed", { reason: state.message })}</Text>
  return null
}

function Summary({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  const { plan, request } = launch
  const variants = experiment.variants.length
  const attempts = plannedAttempts(plan.kind === "ready" ? plan.plan : null, request, variants)
  return (
    <Text role="meta" tone="default" asChild>
      <p role="status" aria-label={t("summary")} className="min-w-0 flex-1 truncate">
        <Attempts count={attempts} />
        <Shape request={request} variants={variants} />
        <CapState state={plan} />
      </p>
    </Text>
  )
}

function LaunchForm({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  const reasons = useReasonCopy()
  const id = useId()
  const notices = `${id}-notices`
  const problems = problemsOf(launch)
  const { draft, available } = launch
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5">
        <FieldRow label={t("cases")} htmlFor={`${id}-cases`}>
          <NumberStepper
            id={`${id}-cases`}
            label={t("cases")}
            value={draft.cases}
            min={MIN_COUNT}
            max={available}
            invalid={problems.includes("cases")}
            describedBy={notices}
            decreaseLabel={t("fewerCases")}
            increaseLabel={t("moreCases")}
            onChange={(cases) => {
              launch.update({ cases })
            }}
          />
          <Text role="hint" tone="neutral" className="tabular-nums">
            {t("ofAvailable", { available })}
          </Text>
        </FieldRow>
        <FieldRow label={t("repeats")} htmlFor={`${id}-repeats`}>
          <NumberStepper
            id={`${id}-repeats`}
            label={t("repeats")}
            value={draft.repeats}
            min={MIN_COUNT}
            max={MAX_REPEATS}
            invalid={problems.includes("repeats")}
            describedBy={notices}
            decreaseLabel={t("fewerRepeats")}
            increaseLabel={t("moreRepeats")}
            onChange={(repeats) => {
              launch.update({ repeats })
            }}
          />
        </FieldRow>
        <FieldRow label={t("split")}>
          <div className="flex min-w-0 flex-col gap-1">
            <ChoiceGroup<SeriesSplit>
              appearance="segmented"
              size="sm"
              label={t("split")}
              value={draft.on}
              items={SERIES_SPLITS.map((split) => ({ value: split, label: t(`purpose.${split}`) }))}
              onValueChange={(on) => {
                launch.update({ on, cases: String(plannedCases(experiment, on)) })
              }}
            />
            <Text role="meta" tone="neutral">
              {t("purposeHint")}
            </Text>
          </div>
        </FieldRow>
      </div>
      <NoticeLine id={notices} notices={noticesOf(launch, experiment, t, reasons)} />
    </div>
  )
}

const activeActions = (action: ResearchAction, labels: { readonly approve: string; readonly stop: string }, active: SeriesSummary): readonly ActionSpec[] => {
  if (isSpendPause(active)) return []
  const approve: readonly ActionSpec[] =
    active.status === "awaiting_approval"
      ? [{ id: "approve", label: labels.approve, variant: "outline", icon: Check, pending: action.pending("approve"), onClick: () => { action.run("approve", (api) => api.approveSeries(active.id)) } }]
      : []
  return [
    ...approve,
    { id: "stop", label: labels.stop, variant: "outline-destructive", icon: Square, pending: action.pending("stop"), onClick: () => { action.run("stop", (api) => api.cancelSeries(active.id)) } },
  ]
}

function ActiveSeries({ series, action }: { readonly series: readonly SeriesSummary[]; readonly action: ResearchAction }) {
  const t = useTranslations("research")
  const active = activeSeries(series)
  if (active === null) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 border-t border-border pt-3">
      <Tag size="xs" tone={SERIES_STATUS_TONE[active.status]}>
        {t(`vocabulary.status.${active.status}`)}
      </Tag>
      <Text role="link" tone="neutral" asChild>
        <Link to={ROUTE_PATH.series} params={{ seriesId: active.id }}>
          {t("experiment.launch.active", { series: seriesRef(active.id), done: active.progress.done, total: active.progress.total })}
        </Link>
      </Text>
      <Actions actions={activeActions(action, { approve: t("experiment.launch.approve"), stop: t("experiment.launch.stop") }, active)} />
      <SpendPause series={active} action={action} />
    </div>
  )
}

export function LaunchPanel({ experiment, series, launch }: LaunchPanelProps) {
  const t = useTranslations("research.experiment.launch")
  return (
    <ResearchSection title={t("title")}>
      <Surface variant="panel" padding="lg" className="flex w-full max-w-2xl min-w-0 flex-col gap-3">
        <LaunchForm experiment={experiment} launch={launch} />
        <div className="flex min-w-0 items-center gap-4 border-t border-border pt-3">
          <Summary experiment={experiment} launch={launch} />
          <div className="shrink-0">
            <RunButton launch={launch} label={t("run")} />
          </div>
        </div>
        <ActiveSeries series={series} action={launch.action} />
      </Surface>
    </ResearchSection>
  )
}
