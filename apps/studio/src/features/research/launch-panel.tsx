import { useId, useState, type ReactNode } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Check, Play, Square } from "lucide-react"
import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type ExperimentDetail, type LaunchEstimate, type LaunchRequest, type SeriesSplit, type SeriesSummary } from "@/domain"
import { Actions, ChoiceGroup, Stat, Surface, Tag, Text, Toolbar, type ActionSpec } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useReasonCopy } from "./copy"
import { Failure, ResearchSection } from "./layout"
import { activeSeries, checkLaunch, draftOf, launchReason, MAX_REPEATS, seriesRef, shortfallOf, type LaunchCheck, type LaunchDraft, type LaunchProblem } from "./presenters"
import { SERIES_STATUS_TONE } from "./tones"
import { useLaunchEstimate, type EstimateState } from "./use-launch-estimate"
import { useResearchAction, type ResearchAction } from "./use-research-action"

export type LaunchPanelProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly launch: LaunchRequest
  readonly estimate: LaunchEstimate
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

function Recommendation({ experiment, estimate }: { readonly experiment: ExperimentDetail; readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  const reasons = useReasonCopy()
  const reason = launchReason(estimate, experiment.metrics, reasons)
  if (estimate.recommended.reason === "look") {
    return (
      <Text as="p" role="hint" tone="neutral">
        {reason}
      </Text>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <Text as="div" role="cell" tone="default" weight="semibold">
        {t("recommended", { cases: estimate.recommended.cases })}
      </Text>
      <Text as="p" role="hint" tone="neutral">
        {reason}
      </Text>
    </div>
  )
}

function EstimateFigures({ estimate }: { readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  return (
    <section aria-label={t("estimateAria")} className="flex flex-wrap items-end gap-x-8 gap-y-3">
      <Stat variant="stacked" label={t("attempts")} value={String(estimate.attempts)} />
      <Stat variant="stacked" label={t("spend")} value={usd(estimate.usd, 2)} />
      <Stat variant="stacked" label={t("time")} value={t("minutes", { count: estimate.minutes })} />
      <Text role="hint" tone="neutral">
        {t("variantsNote", { cases: estimate.request.cases, repeats: estimate.request.repeats, variants: estimate.variants })}
      </Text>
    </section>
  )
}

function Shortfall({ estimate }: { readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  const shortfall = shortfallOf(estimate)
  if (shortfall === null) return null
  return <Callout tone="warning">{t(shortfall, { recommended: estimate.recommended.cases, available: estimate.available })}</Callout>
}

function EstimateBody({ experiment, state }: { readonly experiment: ExperimentDetail; readonly state: EstimateState }) {
  const t = useTranslations("research.experiment.launch")
  if (state.kind === "none") return null
  if (state.kind === "loading") {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("estimating")}
      </Text>
    )
  }
  if (state.kind === "failed") return <Failure message={t("failed", { reason: state.message })} />
  const { estimate } = state
  return (
    <>
      <Recommendation experiment={experiment} estimate={estimate} />
      <EstimateFigures estimate={estimate} />
      <Shortfall estimate={estimate} />
      {estimate.needsApproval ? <Callout tone="neutral">{t("approval")}</Callout> : null}
    </>
  )
}

function ActiveSeries({ series }: { readonly series: SeriesSummary | null }) {
  const t = useTranslations("research")
  if (series === null) return null
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Tag size="xs" tone={SERIES_STATUS_TONE[series.status]}>
        {t(`vocabulary.status.${series.status}`)}
      </Tag>
      <Text role="link" tone="neutral" asChild>
        <Link to={ROUTE_PATH.series} params={{ seriesId: series.id }}>
          {t("experiment.launch.active", { series: seriesRef(series.id), done: series.progress.done, total: series.progress.total })}
        </Link>
      </Text>
    </div>
  )
}

const launchActions = (
  action: ResearchAction,
  labels: { readonly start: string; readonly approve: string; readonly stop: string },
  start: (() => void) | null,
  active: SeriesSummary | null,
): readonly ActionSpec[] => {
  const approve: readonly ActionSpec[] =
    active?.status === "awaiting_approval"
      ? [{ id: "approve", label: labels.approve, variant: "outline", icon: Check, pending: action.pending("approve"), onClick: () => { action.run("approve", (api) => api.approveSeries(active.id)) } }]
      : []
  const stop: readonly ActionSpec[] =
    active === null
      ? []
      : [{ id: "stop", label: labels.stop, variant: "outline-destructive", icon: Square, pending: action.pending("stop"), onClick: () => { action.run("stop", (api) => api.cancelSeries(active.id)) } }]
  return [
    { id: "start", label: labels.start, variant: "default", icon: Play, disabled: start === null, pending: action.pending("start"), ...(start === null ? {} : { onClick: start }) },
    ...approve,
    ...stop,
  ]
}

const problemsOf = (check: LaunchCheck): readonly LaunchProblem[] => (check.kind === "invalid" ? check.problems : NO_PROBLEMS)

export function LaunchPanel({ experiment, series, launch, estimate }: LaunchPanelProps) {
  const t = useTranslations("research")
  const navigate = useNavigate()
  const action = useResearchAction()
  const [draft, setDraft] = useState<LaunchDraft>(() => draftOf(launch))
  const available = experiment.cases.selected
  const check = checkLaunch(draft, available)
  const request = check.kind === "valid" ? check.request : null
  const state = useLaunchEstimate(experiment.id, request, estimate)
  const problems = problemsOf(check)
  const active = activeSeries(series)
  const update = (patch: Partial<LaunchDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }))
  }
  const start =
    request === null
      ? null
      : () => {
          action.run(
            "start",
            (api) => api.startSeries(experiment.id, request),
            async (seriesId) => {
              await navigate({ to: ROUTE_PATH.series, params: { seriesId } })
            },
          )
        }
  return (
    <ResearchSection title={t("experiment.launch.title")}>
      <Surface variant="panel" padding="md" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <NumberField
            label={t("experiment.launch.cases")}
            hint={t("experiment.launch.casesHint", { available })}
            value={draft.cases}
            max={available}
            error={problems.includes("cases") ? t("experiment.launch.casesInvalid", { available }) : null}
            onChange={(cases) => {
              update({ cases })
            }}
          />
          <NumberField
            label={t("experiment.launch.repeats")}
            hint={t("experiment.launch.repeatsHint", { max: MAX_REPEATS })}
            value={draft.repeats}
            max={MAX_REPEATS}
            error={problems.includes("repeats") ? t("experiment.launch.repeatsInvalid", { max: MAX_REPEATS }) : null}
            onChange={(repeats) => {
              update({ repeats })
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
                update({ on })
              }}
            />
          </div>
        </div>
        <EstimateBody experiment={experiment} state={state} />
        <Toolbar wrap className="gap-2.5">
          <Actions actions={launchActions(action, { start: t("experiment.launch.start"), approve: t("experiment.launch.approve"), stop: t("experiment.launch.stop") }, start, active)} />
          <ActiveSeries series={active} />
        </Toolbar>
        {action.state.kind === "failed" ? <Failure message={t("experiment.launch.failed", { reason: action.state.message })} /> : null}
      </Surface>
    </ResearchSection>
  )
}
