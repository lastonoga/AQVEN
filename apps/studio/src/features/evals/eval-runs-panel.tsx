import { useTranslations } from "use-intl"
import { Heading, Matrix, RowLink, Tag, Text, TitledPanel, type MatrixField } from "@/components/studio"
import * as ids from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import { count } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import type { Translator } from "@/i18n/translator"
import type { EvalRunRecord } from "./model"
import { costText, EVAL_RUN_TONE, evalRef, scorerMeansText } from "./presenters"

export type EvalRunsPanelProps = {
  readonly evalId: string
  readonly runs: readonly EvalRunRecord[]
  readonly current: EvalRunRecord | null
  readonly className: string
}

type RunsCopy = {
  readonly t: Translator<"tests">
  readonly status: Translator<"domain.runStatus">
  readonly none: string
  readonly relative: (date: string) => string
}

const runFields = ({ t, status, none, relative }: RunsCopy): readonly MatrixField<EvalRunRecord>[] => [
  {
    id: "run",
    label: t("runs.columns.run"),
    track: "minmax(0,1fr)",
    render: (run) => (
      <Heading
        size="item"
        titleAs="div"
        title={evalRef(run.eval_run_id)}
        below={[
          <Text key="started" as="div" role="meta" truncate>
            {relative(run.started_at)}
          </Text>,
        ]}
      />
    ),
  },
  {
    id: "status",
    label: t("runs.columns.status"),
    track: "120px",
    render: (run) => (
      <Tag size="sm" tone={EVAL_RUN_TONE[run.status]}>
        {status(run.status)}
      </Tag>
    ),
  },
  {
    id: "cases",
    label: t("runs.columns.cases"),
    track: "120px",
    align: "end",
    render: (run) => (
      <Text role="meta" tone="neutral">
        {t("runs.casesOf", { ok: count(run.cases_ok), total: count(run.cases_total) })}
      </Text>
    ),
  },
  {
    id: "scorers",
    label: t("runs.columns.scorers"),
    track: "minmax(0,1.4fr)",
    render: (run) => (
      <Text as="div" role="cell" tone="neutral" truncate>
        {scorerMeansText(run, none)}
      </Text>
    ),
  },
  {
    id: "cost",
    label: t("runs.columns.cost"),
    track: "110px",
    align: "end",
    render: (run) => (
      <Text role="meta" tone="neutral">
        {costText(run.cost_usd)}
      </Text>
    ),
  },
]

export function EvalRunsPanel({ evalId, runs, current, className }: EvalRunsPanelProps) {
  const t = useTranslations("tests")
  const common = useTranslations("common")
  const status = useTranslations("domain.runStatus")
  const relativeTime = useRelativeTime("narrow")
  const copy: RunsCopy = { t, status, none: common("none"), relative: (date) => relativeTime(ids.isoDateTime(date)) }
  return (
    <TitledPanel
      size="section"
      className={className}
      title={t("runs.title")}
      description={t("runs.count", { count: runs.length })}
      surface="raised"
      scroll
      empty={runs.length === 0 ? t("runs.empty", { evalId }) : null}
    >
      <Matrix
        orientation="rows"
        rules="rows"
        label={t("runs.title")}
        items={runs}
        itemKey={(run) => run.eval_run_id}
        fields={runFields(copy)}
        selected={(run) => run.eval_run_id === current?.eval_run_id}
        rowLink={(run) => (
          <RowLink
            from={ROUTE_PATH.evals}
            to="."
            search={{ eval: evalId, run: run.eval_run_id }}
            resetScroll={false}
            aria-label={evalRef(run.eval_run_id)}
            tabIndex={-1}
          />
        )}
      />
    </TitledPanel>
  )
}
