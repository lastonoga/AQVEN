import { useId, useState, type CSSProperties } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { cn } from "cn"
import type { CheckId, ExperimentCheck, SeriesAttempt, SeriesCaseFilter, SeriesCaseRow, SeriesDetail, VariantId } from "@/domain"
import { ChoiceLink, ChoiceList, Empty, Matrix, Surface, Tag, Text, type MatrixField } from "@/components/studio"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { runRef, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useCheckHintCopy } from "./copy"
import { ResearchSection } from "./layout"
import { metricValue } from "./metrics"
import { tagPairs } from "./presenters"
import { CASE_FILTER_KEYS, checkHint, failedChecksOf, hasErrors, hasFilter, hasFinished, isPending, orderedAttempts, pendingOf, tallyOf, tallyTone, toggledFilter, type CaseFilterKey } from "./series-presenters"
import { OUTCOME_TONE } from "./tones"

export type SeriesCasesProps = {
  readonly series: SeriesDetail
  readonly cases: readonly SeriesCaseRow[]
  readonly filter: SeriesCaseFilter
}

type CaseRowProps = {
  readonly row: SeriesCaseRow
  readonly series: SeriesDetail
  readonly template: CSSProperties
  readonly open: boolean
  readonly onToggle: () => void
}

const TALLY_WIDTH = 92
const ATTEMPTS_MIN_WIDTH = 720
const ERROR_MIN_WIDTH = 200
const ERROR_TRACK = `minmax(${String(ERROR_MIN_WIDTH)}px,2fr)`
const LIST_MIN_WIDTH = 720
const EMPTY_MARK = "—"
const TAG_JOIN = " · "

const rowTemplate = (variants: number): CSSProperties => ({
  gridTemplateColumns: `minmax(220px,1fr) repeat(${String(variants)}, ${String(TALLY_WIDTH)}px) minmax(120px,0.5fr) 80px`,
})

const visibleFilters = (series: SeriesDetail): readonly CaseFilterKey[] => CASE_FILTER_KEYS.filter((key) => key !== "divergent" || series.variants.length > 1)

function CaseFilters({ series, filter }: { readonly series: SeriesDetail; readonly filter: SeriesCaseFilter }) {
  const t = useTranslations("research.series.cases")
  return (
    <ChoiceList appearance="chip" label={t("filtersAria")}>
      <ChoiceLink appearance="chip" to={ROUTE_PATH.series} params={{ seriesId: series.id }} search={{}} selected={!hasFilter(filter)}>
        {t("all")}
      </ChoiceLink>
      {visibleFilters(series).map((key) => (
        <ChoiceLink key={key} appearance="chip" to={ROUTE_PATH.series} params={{ seriesId: series.id }} search={toggledFilter(filter, key)} selected={filter[key] === true}>
          {t(key)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}

function RunCell({ attempt }: { readonly attempt: SeriesAttempt }) {
  const t = useTranslations("research.series.cases")
  const ref = runRef(attempt.run)
  return (
    <Text role="link" tone="default" asChild>
      <Link to={ROUTE_PATH.run} params={{ runId: attempt.run }} aria-label={t("openRun", { ref })}>
        {ref}
      </Link>
    </Text>
  )
}

function AttemptError({ attempt }: { readonly attempt: SeriesAttempt }) {
  if (attempt.error === null) {
    return (
      <Text role="cell" tone="neutral">
        {EMPTY_MARK}
      </Text>
    )
  }
  return (
    <Text as="div" role="small" tone="destructive" className="wrap-anywhere">
      {attempt.error}
    </Text>
  )
}

function FailedCheck({ check, hint }: { readonly check: CheckId; readonly hint: string | null }) {
  const tag = (
    <Tag size="micro" fill="tint" tone="destructive">
      {check}
    </Tag>
  )
  if (hint === null) return tag
  return (
    <Tooltip>
      <TooltipTrigger asChild>{tag}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

function CheckTags({ failed, known }: { readonly failed: readonly CheckId[]; readonly known: readonly ExperimentCheck[] }) {
  const copy = useCheckHintCopy()
  if (failed.length === 0) {
    return (
      <Text role="cell" tone="neutral">
        {EMPTY_MARK}
      </Text>
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {failed.map((check) => (
        <FailedCheck key={check} check={check} hint={checkHint(known, check, copy)} />
      ))}
    </div>
  )
}

function useAttemptFields(attempts: readonly SeriesAttempt[], checks: readonly ExperimentCheck[]): readonly MatrixField<SeriesAttempt>[] {
  const t = useTranslations("research")
  const errorFields: readonly MatrixField<SeriesAttempt>[] = hasErrors(attempts)
    ? [{ id: "error", label: t("series.cases.attempt.error"), track: ERROR_TRACK, render: (attempt) => <AttemptError attempt={attempt} /> }]
    : []
  return [
    {
      id: "variant",
      label: t("series.cases.attempt.variant"),
      track: "minmax(120px,1fr)",
      render: (attempt) => (
        <Text as="div" role="cell" tone="default" weight="semibold" truncate>
          {attempt.variant}
        </Text>
      ),
    },
    { id: "repeat", label: t("series.cases.attempt.repeat"), track: "64px", render: (attempt) => <Text role="cell">{String(attempt.repeat)}</Text> },
    {
      id: "outcome",
      label: t("series.cases.attempt.outcome"),
      track: "88px",
      render: (attempt) => (
        <Tag size="xs" tone={OUTCOME_TONE[attempt.outcome]}>
          {t(`vocabulary.outcome.${attempt.outcome}`)}
        </Tag>
      ),
    },
    { id: "failed", label: t("series.cases.attempt.failed"), track: "minmax(160px,1.4fr)", render: (attempt) => <CheckTags failed={attempt.failedChecks} known={checks} /> },
    ...errorFields,
    { id: "usd", label: t("series.cases.attempt.usd"), track: "80px", align: "end", render: (attempt) => <Text role="cell">{usd(attempt.usd)}</Text> },
    {
      id: "latency",
      label: t("series.cases.attempt.latency"),
      track: "80px",
      align: "end",
      render: (attempt) => <Text role="cell">{isPending(attempt.outcome) ? EMPTY_MARK : metricValue(attempt.latencyMs, "ms")}</Text>,
    },
    { id: "run", label: t("series.cases.attempt.run"), track: "96px", render: (attempt) => <RunCell attempt={attempt} /> },
  ]
}

function AttemptsTable({ row, series }: { readonly row: SeriesCaseRow; readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.cases")
  const attempts = orderedAttempts(row.attempts, series.variants)
  const fields = useAttemptFields(attempts, series.checks)
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={t("attemptsAria", { name: row.name })}
        minWidth={hasErrors(attempts) ? ATTEMPTS_MIN_WIDTH + ERROR_MIN_WIDTH : ATTEMPTS_MIN_WIDTH}
        items={attempts}
        itemKey={(attempt) => `${attempt.variant}:${String(attempt.repeat)}`}
        fields={fields}
      />
    </Surface>
  )
}

function PendingTag({ row, variant }: { readonly row: SeriesCaseRow; readonly variant: VariantId }) {
  const t = useTranslations("research.series.cases")
  const waiting = pendingOf(row, variant, "waiting")
  const running = pendingOf(row, variant, "running")
  if (waiting > 0) {
    return (
      <Tag size="xs" tone={OUTCOME_TONE.waiting}>
        {t("waiting", { count: waiting })}
      </Tag>
    )
  }
  if (running > 0) {
    return (
      <Tag size="xs" tone={OUTCOME_TONE.running}>
        {t("running", { count: running })}
      </Tag>
    )
  }
  return (
    <Text role="cell" tone="neutral">
      {t("noAttempts")}
    </Text>
  )
}

function Tally({ row, variant }: { readonly row: SeriesCaseRow; readonly variant: VariantId }) {
  const t = useTranslations("research.series.cases")
  const tally = tallyOf(row, variant)
  if (tally === null || tally.total === 0) {
    return (
      <div className="min-w-0">
        <PendingTag row={row} variant={variant} />
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <Tag size="xs" tone={tallyTone(tally)} aria-label={t("tallyAria", { variant, passed: tally.passed, total: tally.total })}>
        {t("tally", { passed: tally.passed, total: tally.total })}
      </Tag>
    </div>
  )
}

function CaseRow({ row, series, template, open, onToggle }: CaseRowProps) {
  const regionId = useId()
  const pairs = tagPairs(row.tags)
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        style={template}
        className="grid w-full cursor-pointer items-center gap-x-3 px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:inset-ring-2 focus-visible:inset-ring-ring"
      >
        <div className="flex min-w-0 items-start gap-1.5">
          <ChevronRight aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <div className="min-w-0">
            <Text as="div" role="cell" tone="default" weight="semibold" truncate>
              {row.name}
            </Text>
            {pairs.length === 0 ? null : (
              <Text as="div" role="caption" tone="neutral" truncate title={pairs.join(TAG_JOIN)} className="mt-0.5">
                {pairs.join(TAG_JOIN)}
              </Text>
            )}
          </div>
        </div>
        {series.variants.map((variant) => (
          <Tally key={variant} row={row} variant={variant} />
        ))}
        <CheckTags failed={failedChecksOf(row)} known={series.checks} />
        <Text role="cell" tone="neutral" className="text-right">
          {hasFinished(row) ? usd(row.usd) : EMPTY_MARK}
        </Text>
      </button>
      {open ? (
        <div id={regionId} className="border-t border-border bg-background-subtle px-3 py-2.5">
          <AttemptsTable row={row} series={series} />
        </div>
      ) : null}
    </li>
  )
}

function CaseHeader({ series, template }: { readonly series: SeriesDetail; readonly template: CSSProperties }) {
  const t = useTranslations("research.series.cases.column")
  return (
    <div aria-hidden style={template} className="grid items-end gap-x-3 bg-muted px-3 py-2">
      <Text role="column" tone="neutral" className="pl-5">
        {t("case")}
      </Text>
      {series.variants.map((variant) => (
        <Text key={variant} role="column" tone="neutral" verbatim truncate>
          {variant}
        </Text>
      ))}
      <Text role="column" tone="neutral">
        {t("failed")}
      </Text>
      <Text role="column" tone="neutral" className="text-right">
        {t("usd")}
      </Text>
    </div>
  )
}

function CaseList({ series, cases, filter }: SeriesCasesProps) {
  const t = useTranslations("research.series.cases")
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set())
  const template = rowTemplate(series.variants.length)
  if (cases.length === 0) return <Empty title={hasFilter(filter) ? t("empty") : t("emptyAll")} />
  const toggle = (name: string): void => {
    setOpenRows((current) => {
      const next = new Set(current)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <div style={{ minWidth: LIST_MIN_WIDTH }}>
        <CaseHeader series={series} template={template} />
        <ol aria-label={t("aria")} className="divide-y divide-border border-t border-border">
          {cases.map((row) => (
            <CaseRow
              key={row.name}
              row={row}
              series={series}
              template={template}
              open={openRows.has(row.name)}
              onToggle={() => {
                toggle(row.name)
              }}
            />
          ))}
        </ol>
      </div>
    </Surface>
  )
}

export function SeriesCases({ series, cases, filter }: SeriesCasesProps) {
  const t = useTranslations("research.series.cases")
  return (
    <ResearchSection title={t("title")} description={cases.length} trailing={<CaseFilters series={series} filter={filter} />}>
      <CaseList series={series} cases={cases} filter={filter} />
    </ResearchSection>
  )
}
