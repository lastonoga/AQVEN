import { useId, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { Check, Square } from "lucide-react"
import { useTranslations } from "use-intl"
import { SERIES_SPLITS, type ExperimentDetail, type LaunchEstimate, type SeriesSplit, type SeriesSummary } from "@/domain"
import { Actions, ChoiceGroup, NumberStepper, Surface, Tag, Text, Tile, TileNote, TileValue, type ActionSpec, type TextTone } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import { usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useReasonCopy } from "./copy"
import { ResearchSection } from "./layout"
import { activeSeries, launchReason, MAX_REPEATS, plannedAttempts, plannedCases, seriesRef, shortfallOf, spendEstimate, type ReasonCopy } from "./presenters"
import { RunButton } from "./run-button"
import { SERIES_STATUS_TONE } from "./tones"
import type { EstimateState } from "./use-launch-estimate"
import type { Launch } from "./use-launch"
import type { ResearchAction } from "./use-research-action"

export type LaunchPanelProps = {
  readonly experiment: ExperimentDetail
  readonly series: readonly SeriesSummary[]
  readonly launch: Launch
}

type Hint = { readonly tone: TextTone; readonly text: string; readonly title?: string | undefined }

type ControlProps = {
  readonly label: string
  readonly htmlFor?: string
  readonly hint?: Hint & { readonly id: string }
  readonly children: ReactNode
}

const MIN_COUNT = 1

const readyEstimate = (state: EstimateState): LaunchEstimate | null => (state.kind === "ready" ? state.estimate : null)

const recommendationHint = (estimate: LaunchEstimate, experiment: ExperimentDetail, t: Translator<"research.experiment.launch">, reasons: ReasonCopy): Hint | null => {
  if (estimate.recommended.reason === "look") return null
  const title = launchReason(estimate, experiment.metrics, reasons)
  const shortfall = shortfallOf(estimate)
  if (shortfall === null) return { tone: "neutral", text: t("recommended", { cases: estimate.recommended.cases }), title }
  return { tone: "warning", text: t(shortfall, { recommended: estimate.recommended.cases, available: estimate.available }), title }
}

const casesHint = (launch: Launch, experiment: ExperimentDetail, t: Translator<"research.experiment.launch">, reasons: ReasonCopy): Hint => {
  const { check, available } = launch
  if (check.kind === "invalid" && check.problems.includes("cases")) return { tone: "destructive", text: t("casesInvalid", { available }) }
  const estimate = readyEstimate(launch.estimate)
  const recommended = estimate === null ? null : recommendationHint(estimate, experiment, t, reasons)
  return recommended ?? { tone: "neutral", text: t("casesRange", { available }) }
}

const repeatsHint = (launch: Launch, t: Translator<"research.experiment.launch">): Hint => {
  const { check } = launch
  if (check.kind === "invalid" && check.problems.includes("repeats")) return { tone: "destructive", text: t("repeatsInvalid", { max: MAX_REPEATS }) }
  return { tone: "neutral", text: t("repeatsRange", { max: MAX_REPEATS }) }
}

function Control({ label, htmlFor, hint, children }: ControlProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Text as="div" role="label" tone="neutral" asChild>
        <label htmlFor={htmlFor}>{label}</label>
      </Text>
      {children}
      {hint === undefined ? null : (
        <Text id={hint.id} as="p" role="caption" tone={hint.tone} title={hint.title}>
          {hint.text}
        </Text>
      )}
    </div>
  )
}

function CasesControl({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  const reasons = useReasonCopy()
  const id = useId()
  const hint = casesHint(launch, experiment, t, reasons)
  const { draft, available } = launch
  return (
    <Control label={t("cases")} htmlFor={id} hint={{ ...hint, id: `${id}-hint` }}>
      <div className="flex items-center gap-2">
        <NumberStepper
          id={id}
          label={t("cases")}
          value={draft.cases}
          min={MIN_COUNT}
          max={available}
          invalid={hint.tone === "destructive"}
          describedBy={`${id}-hint`}
          decreaseLabel={t("fewerCases")}
          increaseLabel={t("moreCases")}
          onChange={(cases) => {
            launch.update({ cases })
          }}
        />
        <Text role="hint" tone="neutral">
          {t("ofAvailable", { available })}
        </Text>
      </div>
    </Control>
  )
}

function RepeatsControl({ launch }: { readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  const id = useId()
  const hint = repeatsHint(launch, t)
  return (
    <Control label={t("repeats")} htmlFor={id} hint={{ ...hint, id: `${id}-hint` }}>
      <NumberStepper
        id={id}
        label={t("repeats")}
        value={launch.draft.repeats}
        min={MIN_COUNT}
        max={MAX_REPEATS}
        invalid={hint.tone === "destructive"}
        describedBy={`${id}-hint`}
        decreaseLabel={t("fewerRepeats")}
        increaseLabel={t("moreRepeats")}
        onChange={(repeats) => {
          launch.update({ repeats })
        }}
      />
    </Control>
  )
}

function SplitControl({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research")
  return (
    <Control label={t("experiment.launch.split")}>
      <ChoiceGroup<SeriesSplit>
        appearance="segmented"
        size="sm"
        label={t("experiment.launch.split")}
        value={launch.draft.on}
        items={SERIES_SPLITS.map((split) => ({ value: split, label: t(`vocabulary.splitChoice.${split}`) }))}
        onValueChange={(on) => {
          launch.update({ on, cases: String(plannedCases(experiment, on)) })
        }}
      />
    </Control>
  )
}

function AttemptsTile({ experiment, launch }: { readonly experiment: ExperimentDetail; readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  const estimate = readyEstimate(launch.estimate)
  const attempts = plannedAttempts(estimate, launch.request, experiment.variants.length)
  const minutes = estimate?.minutes ?? null
  return (
    <Tile label={t("attempts")} variant="well" className="min-w-32">
      <TileValue>{attempts ?? t("none")}</TileValue>
      {minutes === null ? null : <TileNote>{t("minutes", { count: minutes })}</TileNote>}
    </Tile>
  )
}

function CapNote({ estimate }: { readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  const cap = usd(estimate.capUsd)
  if (estimate.usd === null) return <TileNote tone="warning">{t("noPrice")}</TileNote>
  if (estimate.needsApproval) return <TileNote tone="warning">{t("approval", { cap })}</TileNote>
  return <TileNote>{t("cap", { cap })}</TileNote>
}

function ReadyEstimate({ estimate }: { readonly estimate: LaunchEstimate }) {
  const t = useTranslations("research.experiment.launch")
  const spend = spendEstimate(estimate)
  return (
    <>
      <TileValue>{spend.source === "unknown" ? t("none") : t("price", { source: spend.source, usd: spend.usd })}</TileValue>
      <Text as="p" role="meta" tone="default">
        {t(`source.${spend.source}`)}
      </Text>
      <CapNote estimate={estimate} />
    </>
  )
}

function EstimateBody({ state }: { readonly state: EstimateState }) {
  const t = useTranslations("research.experiment.launch")
  if (state.kind === "ready") return <ReadyEstimate estimate={state.estimate} />
  if (state.kind === "loading") {
    return (
      <>
        <TileValue>{t("pending")}</TileValue>
        <TileNote>{t("estimating")}</TileNote>
      </>
    )
  }
  if (state.kind === "failed") {
    return (
      <>
        <TileValue>{t("none")}</TileValue>
        <TileNote tone="destructive">{t("estimateFailed", { reason: state.message })}</TileNote>
      </>
    )
  }
  return <TileValue>{t("none")}</TileValue>
}

function EstimateTile({ launch }: { readonly launch: Launch }) {
  const t = useTranslations("research.experiment.launch")
  return (
    <Tile label={t("estimateLabel")} variant="well" className="min-w-44">
      <EstimateBody state={launch.estimate} />
    </Tile>
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
    </div>
  )
}

export function LaunchPanel({ experiment, series, launch }: LaunchPanelProps) {
  const t = useTranslations("research.experiment.launch")
  return (
    <ResearchSection title={t("title")}>
      <Surface variant="panel" padding="lg" className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-4">
          <CasesControl experiment={experiment} launch={launch} />
          <RepeatsControl launch={launch} />
          <SplitControl experiment={experiment} launch={launch} />
          <div className="flex min-w-0 flex-wrap items-stretch gap-3">
            <AttemptsTile experiment={experiment} launch={launch} />
            <EstimateTile launch={launch} />
          </div>
          <div className="ml-auto self-center">
            <RunButton launch={launch} label={t("run")} />
          </div>
        </div>
        <ActiveSeries series={series} action={launch.action} />
      </Surface>
    </ResearchSection>
  )
}
