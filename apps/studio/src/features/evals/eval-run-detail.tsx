import { useTranslations } from "use-intl"
import {
  Matrix,
  SectionStack,
  Surface,
  Text,
  TitledPanel,
  type MatrixField,
  type PropertyRow,
  type SectionSpec,
  type TextLine,
} from "@/components/studio"
import * as ids from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import { count, joinMeta, score } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import type { EvalRunRecord, GateReport, GateTest, ScorerSummary } from "./model"
import {
  costText,
  durationText,
  EVAL_RUN_TONE,
  evalRef,
  gateNumber,
  GATE_TONE,
  meanText,
  passRateText,
  rangeText,
  tokensText,
} from "./presenters"

export type EvalRunDetailProps = {
  readonly run: EvalRunRecord
  readonly gate: GateReport | null
  readonly className: string
}

type DetailCopy = {
  readonly t: Translator<"testDetail">
  readonly status: Translator<"domain.runStatus">
  readonly none: string
  readonly relative: (date: string) => string
}

const scorerFields = ({ t, none }: DetailCopy): readonly MatrixField<ScorerSummary>[] => [
  {
    id: "scorer",
    label: t("scorers.columns.scorer"),
    track: "minmax(0,1fr)",
    verbatim: true,
    render: (scorer) => (
      <Text as="div" role="cell" weight="semibold" verbatim truncate>
        {scorer.scorer_id}
      </Text>
    ),
  },
  {
    id: "kind",
    label: t("scorers.columns.kind"),
    track: "110px",
    render: (scorer) => (
      <Text role="meta" tone="neutral" verbatim>
        {scorer.kind}
      </Text>
    ),
  },
  {
    id: "n",
    label: t("scorers.columns.n"),
    track: "80px",
    align: "end",
    render: (scorer) => (
      <Text role="meta" tone="neutral">
        {count(scorer.n)}
      </Text>
    ),
  },
  {
    id: "mean",
    label: t("scorers.columns.mean"),
    track: "90px",
    align: "end",
    render: (scorer) => (
      <Text role="meta" tone="neutral">
        {meanText(scorer, none)}
      </Text>
    ),
  },
  {
    id: "passRate",
    label: t("scorers.columns.passRate"),
    track: "100px",
    align: "end",
    render: (scorer) => (
      <Text role="meta" tone="neutral">
        {passRateText(scorer, none)}
      </Text>
    ),
  },
  {
    id: "range",
    label: t("scorers.columns.range"),
    track: "130px",
    align: "end",
    render: (scorer) => (
      <Text role="meta" tone="neutral">
        {rangeText(scorer, none)}
      </Text>
    ),
  },
]

const gateFields = ({ t, none }: DetailCopy): readonly MatrixField<GateTest>[] => [
  {
    id: "scorer",
    label: t("gate.columns.scorer"),
    track: "minmax(0,1fr)",
    verbatim: true,
    render: (test) => (
      <Text as="div" role="cell" weight="semibold" verbatim truncate>
        {test.scorer_id}
      </Text>
    ),
  },
  {
    id: "family",
    label: t("gate.columns.family"),
    track: "110px",
    render: (test) => (
      <Text role="meta" tone="neutral" verbatim>
        {test.family}
      </Text>
    ),
  },
  {
    id: "delta",
    label: t("gate.columns.delta"),
    track: "100px",
    align: "end",
    render: (test) => (
      <Text role="meta" tone="neutral">
        {score(test.delta)}
      </Text>
    ),
  },
  {
    id: "interval",
    label: t("gate.columns.interval"),
    track: "150px",
    align: "end",
    render: (test) => (
      <Text role="meta" tone="neutral">
        {t("gate.interval", { low: score(test.ci_lo), high: score(test.ci_hi) })}
      </Text>
    ),
  },
  {
    id: "p",
    label: t("gate.columns.p"),
    track: "100px",
    align: "end",
    render: (test) => (
      <Text role="meta" tone="neutral">
        {gateNumber(test.p_adj, none)}
      </Text>
    ),
  },
  {
    id: "verdict",
    label: t("gate.columns.verdict"),
    track: "120px",
    align: "end",
    render: (test) => (
      <Text role="meta" tone={GATE_TONE[test.verdict]} verbatim>
        {test.verdict}
      </Text>
    ),
  },
]

const summaryRows = (run: EvalRunRecord, copy: DetailCopy): readonly PropertyRow[] => {
  const { t, status, none, relative } = copy
  return [
    { key: t("run.status"), value: status(run.status), tone: EVAL_RUN_TONE[run.status] },
    { key: t("run.started"), value: relative(run.started_at) },
    { key: t("run.duration"), value: durationText(run.started_at, run.finished_at) ?? none },
    { key: t("run.repeats"), value: count(run.repeats) },
    { key: t("run.seeds"), value: joinMeta(run.seeds.map((seed) => count(seed))) },
    { key: t("run.cases"), value: t("run.casesOf", { ok: count(run.cases_ok), total: count(run.cases_total) }) },
    { key: t("run.dropped"), value: run.dropped_cases.length === 0 ? none : joinMeta(run.dropped_cases) },
    { key: t("run.cost"), value: costText(run.cost_usd) },
    { key: t("run.tokens"), value: tokensText(run.tokens_in, run.tokens_out) },
  ]
}

const gateRows = (gate: GateReport, { t, none }: DetailCopy): readonly PropertyRow[] => [
  { key: t("gate.decision"), value: gate.decision, tone: GATE_TONE[gate.decision] },
  { key: t("gate.reason"), value: gate.reason_code ?? none },
  { key: t("gate.repeats"), value: count(gate.repeats) },
  { key: t("gate.dropped"), value: gate.dropped_cases.length === 0 ? none : joinMeta(gate.dropped_cases) },
]

const gateSections = (run: EvalRunRecord, gate: GateReport | null, copy: DetailCopy): readonly SectionSpec[] => {
  const { t } = copy
  if (gate === null && (run.baseline_run_id ?? null) === null) {
    return [{ id: "gate", title: t("gate.title"), body: { kind: "text", lines: [[t("gate.noBaseline")]], variant: "plain" } }]
  }
  if (gate === null) {
    return [{ id: "gate", title: t("gate.title"), body: { kind: "text", lines: [[t("gate.none")]], variant: "plain" } }]
  }
  return [
    { id: "gate", title: t("gate.title"), body: { kind: "properties", variant: "grid", rows: gateRows(gate, copy) } },
    {
      id: "gateTests",
      title: t("gate.tests"),
      body: {
        kind: "node",
        node: (
          <Surface variant="panel" radius="lg" className="overflow-hidden">
            <Matrix
              orientation="rows"
              rules="rows"
              label={t("gate.tests")}
              items={gate.per_test}
              itemKey={(test) => `${test.node_id ?? ""}/${test.scorer_id}`}
              fields={gateFields(copy)}
            />
          </Surface>
        ),
      },
    },
  ]
}

const noteLines = (notes: readonly string[]): readonly TextLine[] => notes.map((note) => [note])

const noteSections = (run: EvalRunRecord, { t }: DetailCopy): readonly SectionSpec[] => {
  if (run.notes.length === 0) return []
  return [
    {
      id: "notes",
      title: t("run.notes"),
      hint: t("run.noteCount", { count: run.notes.length }),
      body: { kind: "text", lines: noteLines(run.notes), variant: "plain" },
    },
  ]
}

const errorSections = (run: EvalRunRecord, { t }: DetailCopy): readonly SectionSpec[] => {
  const failure = run.error ?? null
  if (failure === null) return []
  return [{ id: "error", title: t("run.error"), body: { kind: "text", lines: [[failure]], variant: "plain" } }]
}

const detailSections = (run: EvalRunRecord, gate: GateReport | null, copy: DetailCopy): readonly SectionSpec[] => [
  { id: "summary", title: copy.t("run.summary"), body: { kind: "properties", variant: "grid", rows: summaryRows(run, copy) } },
  {
    id: "scorers",
    title: copy.t("scorers.title"),
    body: {
      kind: "node",
      node: (
        <Surface variant="panel" radius="lg" className="overflow-hidden">
          <Matrix
            orientation="rows"
            rules="rows"
            label={copy.t("scorers.title")}
            items={run.scorers}
            itemKey={(scorer) => scorer.scorer_id}
            fields={scorerFields(copy)}
          />
        </Surface>
      ),
    },
  },
  ...gateSections(run, gate, copy),
  ...errorSections(run, copy),
  ...noteSections(run, copy),
]

export function EvalRunDetail({ run, gate, className }: EvalRunDetailProps) {
  const t = useTranslations("testDetail")
  const common = useTranslations("common")
  const status = useTranslations("domain.runStatus")
  const relativeTime = useRelativeTime("long")
  const copy: DetailCopy = { t, status, none: common("none"), relative: (date) => relativeTime(ids.isoDateTime(date)) }
  return (
    <TitledPanel
      size="section"
      className={className}
      title={t("run.title", { ref: evalRef(run.eval_run_id) })}
      description={joinMeta([run.eval_id, run.dataset_id, run.inference, run.agent])}
      surface="raised"
    >
      <div className="p-3.5">
        <SectionStack sections={detailSections(run, gate, copy)} gap="lg" />
      </div>
    </TitledPanel>
  )
}
