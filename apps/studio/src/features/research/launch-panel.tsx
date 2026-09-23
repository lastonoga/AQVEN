import { useId, useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Check, Square } from "lucide-react"
import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type ExperimentDetail, type LaunchEstimate, type SeriesSplit, type SeriesSummary } from "@/domain"
import { Actions, ChoiceGroup, Expander, Surface, Tag, Text, type ActionSpec } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { joinMeta, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useReasonCopy } from "./copy"
import { Failure, ResearchSection } from "./layout"
import { activeSeries, launchReason, MAX_REPEATS, plannedCases, seriesRef, shortfallOf, type LaunchProblem } from "./presenters"
import { SERIES_STATUS_TONE } from "./tones"
import type { EstimateState } from "./use-launch-estimate"
import type { Launch } from "./use-launch"
import type { ResearchAction } from "./use-research-action"

export type LaunchPanelProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly launch: Launch
}

type NumberFieldProps = {
  readonly label: string
  readonly hint: string
  readonly value: string
  readonly max: number
  readonly error: string | null
  readonly onChange: (value: string) => void
}

const NO_PROBLEMS: readonly LaunchProblem[] = []

function NumberField({ label, hint, value, max, error, onChange }: NumberFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className="flex flex-col gap-1.5">
      <Text as="div" role="hint" tone="neutral" asChild>
        <label htmlFor={id}>{label}</label>
      </Text>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        aria-invalid={error !== null}
        aria-describedby={hintId}
        className="w-28 font-mono"
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      <Text id={hintId} as="div" role="caption" tone={error === null ? "neutral" : "destructive"}>
        {error ?? hint}
      </Text>
    </div>
  )
}

function Callout({ tone, children }: { readonly tone: "warning" | "neutral"; readonly children: ReactNode }) {
  return (
    <Surface variant="callout" tone={tone} padding="sm" role="note">
      <Text as="p" role="hint">
        {children}
      </Text>
    </Surface>
  )
}

function useSummary(launch: Launch): string {
  const t = useTranslations("research")
  const { draft, estimate } = launch
  const split = t(`vocabulary.split.${draft.on}`)
  const size = t("experiment.launch.size", { cases: draft.cases, repeats: draft.repeats })
  if (estimate.kind === "loading") return joinMeta([size, t("experiment.launch.estimating"), split])
  if (estimate.kind !== "ready") return joinMeta([size, split])
  const { usd: spend, minutes, attempts } = estimate.estimate
  return joinMeta([
    size,
    t("experiment.launch.attempts", { count: attempts }),
    spend === null ? t("experiment.launch.noEstimate") : t("experiment.launch.spend", { usd: usd(spend) }),
    minutes === null ? null : t("experiment.launch.minutes", { count: minutes }),
    split,
  ])
}

function Recommendation({ experiment, estimate }: { readonly experiment: ExperimentDetail; readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  const reasons = useReasonCopy()
  const reason = launchReason(estimate, experiment.metrics, reasons)
  const shortfall = shortfallOf(estimate)
  return (
    <div className="flex flex-col gap-2">
      {estimate.recommended.reason === "look" ? null : (
        <Text as="div" role="cell" tone="default" weight="semibold">
          {t("recommended", { cases: estimate.recommended.cases })}
        </Text>
      )}
      <Text as="p" role="hint" tone="neutral">
        {joinMeta([reason, t("cap", { cap: usd(estimate.capUsd) })])}
      </Text>
      {shortfall === null ? null : <Callout tone="warning">{t(shortfall, { recommended: estimate.recommended.cases, available: estimate.available })}</Callout>}
    </div>
  )
}

function EstimateDetail({ experiment, state }: { readonly experiment: ExperimentDetail; readonly state: EstimateState }) {
  if (state.kind !== "ready") return null
  return <Recommendation experiment={experiment} estimate={state.estimate} />
}

function ApprovalNote({ state }: { readonly state: EstimateState }) {
  const t = useTranslations("research.experiment.launch")
  if (state.kind === "failed") return <Failure message={t("failed", { reason: state.message })} />
  if (state.kind !== "ready") return null
  const { estimate } = state
  if (estimate.usd === null) return <Callout tone="neutral">{t("noPrice")}</Callout>
  if (!estimate.needsApproval) return null
  return <Callout tone="neutral">{t("approval", { cap: usd(estimate.capUsd) })}</Callout>
}

function Adjust({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research")
  const { draft, available, check } = launch
  const problems = check.kind === "invalid" ? check.problems : NO_PROBLEMS
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <NumberField
          label={t("experiment.launch.cases")}
          hint={t("experiment.launch.casesHint", { available, split: t(`vocabulary.split.${draft.on}`) })}
          value={draft.cases}
          max={available}
          error={problems.includes("cases") ? t("experiment.launch.casesInvalid", { available }) : null}
          onChange={(cases) => {
            launch.update({ cases })
          }}
        />
        <NumberField
          label={t("experiment.launch.repeats")}
          hint={t("experiment.launch.repeatsHint", { max: MAX_REPEATS })}
          value={draft.repeats}
          max={MAX_REPEATS}
          error={problems.includes("repeats") ? t("experiment.launch.repeatsInvalid", { max: MAX_REPEATS }) : null}
          onChange={(repeats) => {
            launch.update({ repeats })
          }}
        />
        <div className="flex flex-col gap-1.5">
          <Text as="div" role="hint" tone="neutral">
            {t("experiment.launch.split")}
          </Text>
          <ChoiceGroup<SeriesSplit>
            appearance="segmented"
            size="sm"
            label={t("experiment.launch.split")}
            value={draft.on}
            items={SERIES_SPLITS.map((split) => ({ value: split, label: t(`vocabulary.split.${split}`) }))}
            onValueChange={(on) => {
              launch.update({ on, cases: String(plannedCases(experiment, on)) })
            }}
          />
        </div>
      </div>
      <EstimateDetail experiment={experiment} state={launch.estimate} />
    </div>
  )
}

const activeActions = (action: ResearchAction, labels: { readonly approve: string; readonly stop: string }, active: SeriesSummary): readonly ActionSpec[] => {
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
    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
      <Tag size="xs" tone={SERIES_STATUS_TONE[active.status]}>
        {t(`vocabulary.status.${active.status}`)}
      </Tag>
      <Text role="link" tone="neutral" asChild>
        <Link to={ROUTE_PATH.series} params={{ seriesId: active.id }}>
          {t("experiment.launch.active", { series: seriesRef(active.id), done: active.progress.done, total: active.progress.total })}
        </Link>
      </Text>
      <Actions actions={activeActions(action, { approve: t("experiment.launch.approve"), stop: t("experiment.launch.stop") }, active)} />
    </div>
  )
}

export function LaunchPanel({ experiment, series, launch }: LaunchPanelProps) {
  const t = useTranslations("research.experiment.launch")
  const adjustId = useId()
  const [open, setOpen] = useState(false)
  const summary = useSummary(launch)
  return (
    <ResearchSection title={t("title")}>
      <Surface variant="panel" padding="md" className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Text as="p" role="body" tone="default">
            {summary}
          </Text>
          <Expander
            open={open}
            controls={adjustId}
            label={t("adjust")}
            size="sm"
            onClick={() => {
              setOpen((current) => !current)
            }}
          />
        </div>
        <ApprovalNote state={launch.estimate} />
        {open ? (
          <div id={adjustId} role="region" aria-label={t("adjustAria")}>
            <Adjust experiment={experiment} launch={launch} />
          </div>
        ) : null}
        <ActiveSeries series={series} action={launch.action} />
      </Surface>
    </ResearchSection>
  )
}
