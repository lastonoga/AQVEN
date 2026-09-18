import { cn } from "cn"
import { useTranslations } from "use-intl"
import {
  Matrix,
  RowLink,
  SectionStack,
  Surface,
  Tag,
  Text,
  TitledPanel,
  type MatrixField,
  type PropertyRow,
  type SectionSpec,
} from "@/components/studio"
import { count, score } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import type { Translator } from "@/i18n/translator"
import type { CaseScore, EvalCase } from "./model"
import { CASE_TONE, caseKey, costText, isCase, latencyText, outputText, scoresText, tokensText } from "./presenters"

export type EvalCasesPanelProps = {
  readonly evalId: string
  readonly runId: string
  readonly cases: readonly EvalCase[]
  readonly caseName: string | null
  readonly caseRepeat: number | null
  readonly className: string
}

type CasesCopy = {
  readonly t: Translator<"testDetail">
  readonly status: Translator<"domain.executionStatus">
  readonly none: string
}

const caseTitle = (row: EvalCase): string => `${row.case_name} #${String(row.run_index)}`

const caseFields = ({ t, status, none }: CasesCopy): readonly MatrixField<EvalCase>[] => [
  {
    id: "case",
    label: t("columns.case"),
    track: "minmax(0,1fr)",
    verbatim: true,
    render: (row) => (
      <Text as="div" role="cell" weight="semibold" verbatim truncate>
        {caseTitle(row)}
      </Text>
    ),
  },
  {
    id: "status",
    label: t("columns.status"),
    track: "110px",
    render: (row) => (
      <Tag size="sm" tone={CASE_TONE[row.status]}>
        {status(row.status)}
      </Tag>
    ),
  },
  {
    id: "seed",
    label: t("columns.seed"),
    track: "80px",
    align: "end",
    render: (row) => (
      <Text role="meta" tone="neutral">
        {count(row.seed)}
      </Text>
    ),
  },
  {
    id: "latency",
    label: t("columns.latency"),
    track: "100px",
    align: "end",
    render: (row) => (
      <Text role="meta" tone="neutral">
        {latencyText(row.latency_ms)}
      </Text>
    ),
  },
  {
    id: "scores",
    label: t("columns.scores"),
    track: "minmax(0,1.4fr)",
    render: (row) => (
      <Text as="div" role="cell" tone="neutral" truncate>
        {scoresText(row, none)}
      </Text>
    ),
  },
]

const passedText = (row: CaseScore, { t, none }: CasesCopy): string => {
  if (row.passed === null || row.passed === undefined) return none
  return row.passed ? t("case.yes") : t("case.no")
}

const scoreFields = (copy: CasesCopy): readonly MatrixField<CaseScore>[] => [
  {
    id: "scorer",
    label: copy.t("case.scorer"),
    track: "minmax(0,1fr)",
    verbatim: true,
    render: (row) => (
      <Text as="div" role="cell" weight="semibold" verbatim truncate>
        {row.scorer_id}
      </Text>
    ),
  },
  {
    id: "value",
    label: copy.t("case.value"),
    track: "100px",
    align: "end",
    render: (row) => (
      <Text role="meta" tone="neutral">
        {score(row.value)}
      </Text>
    ),
  },
  {
    id: "passed",
    label: copy.t("case.passed"),
    track: "100px",
    align: "end",
    render: (row) => (
      <Text role="meta" tone="neutral">
        {passedText(row, copy)}
      </Text>
    ),
  },
  {
    id: "reason",
    label: copy.t("case.reason"),
    track: "minmax(0,1.6fr)",
    render: (row) => (
      <Text as="div" role="cell" tone="neutral" truncate>
        {row.reason ?? copy.none}
      </Text>
    ),
  },
]

const caseRows = (row: EvalCase, { t, status, none }: CasesCopy): readonly PropertyRow[] => [
  { key: t("case.status"), value: status(row.status), tone: CASE_TONE[row.status] },
  { key: t("case.seed"), value: count(row.seed) },
  { key: t("case.latency"), value: latencyText(row.latency_ms) },
  { key: t("case.cost"), value: costText(row.cost_usd) },
  { key: t("case.tokens"), value: tokensText(row.tokens_in, row.tokens_out) },
  { key: t("case.run"), value: row.run_id === null || row.run_id === undefined ? none : { text: row.run_id, mono: true } },
]

const scoreSections = (row: EvalCase, copy: CasesCopy): readonly SectionSpec[] => {
  if (row.scores.length === 0) return []
  return [
    {
      id: "scores",
      title: copy.t("case.scores"),
      body: {
        kind: "node",
        node: (
          <Surface variant="panel" radius="lg" className="overflow-hidden">
            <Matrix
              orientation="rows"
              rules="rows"
              label={copy.t("case.scores")}
              items={row.scores}
              itemKey={(entry) => entry.scorer_id}
              fields={scoreFields(copy)}
            />
          </Surface>
        ),
      },
    },
  ]
}

const failureSections = (row: EvalCase, { t }: CasesCopy): readonly SectionSpec[] => {
  const failure = row.error ?? null
  if (failure === null) return []
  return [{ id: "error", title: t("case.error"), body: { kind: "text", lines: [[failure]], variant: "plain" } }]
}

const outputSections = (row: EvalCase, { t }: CasesCopy): readonly SectionSpec[] => {
  if (outputText(row.output) === null) return [{ id: "output", title: t("case.output"), body: { kind: "text", lines: [[t("case.noOutput")]], variant: "plain" } }]
  return [{ id: "output", title: t("case.output"), body: { kind: "value", value: row.output } }]
}

const caseSections = (row: EvalCase, copy: CasesCopy): readonly SectionSpec[] => [
  { id: "fields", title: copy.t("case.fields"), body: { kind: "properties", variant: "grid", rows: caseRows(row, copy) } },
  ...scoreSections(row, copy),
  ...failureSections(row, copy),
  ...outputSections(row, copy),
]

function CasePanel({ row, copy }: { readonly row: EvalCase; readonly copy: CasesCopy }) {
  return (
    <TitledPanel size="section" title={copy.t("case.title", { name: caseTitle(row) })} surface="raised">
      <div className="p-3.5">
        <SectionStack sections={caseSections(row, copy)} gap="lg" />
      </div>
    </TitledPanel>
  )
}

export function EvalCasesPanel({ evalId, runId, cases, caseName, caseRepeat, className }: EvalCasesPanelProps) {
  const t = useTranslations("testDetail")
  const common = useTranslations("common")
  const status = useTranslations("domain.executionStatus")
  const copy: CasesCopy = { t, status, none: common("none") }
  const current = cases.find((row) => isCase(row, caseName, caseRepeat)) ?? cases[0] ?? null
  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <TitledPanel
        size="section"
        title={t("title")}
        description={t("cases", { count: cases.length })}
        surface="raised"
        scroll
        empty={cases.length === 0 ? t("empty") : null}
      >
        <Matrix
          orientation="rows"
          rules="rows"
          label={t("title")}
          items={cases}
          itemKey={caseKey}
          fields={caseFields(copy)}
          selected={(row) => row === current}
          rowLink={(row) => (
            <RowLink
              from={ROUTE_PATH.evals}
              to="."
              search={{ eval: evalId, run: runId, case: row.case_name, rep: row.run_index }}
              resetScroll={false}
              aria-label={caseTitle(row)}
              tabIndex={-1}
            />
          )}
        />
      </TitledPanel>
      {current === null ? null : <CasePanel row={current} copy={copy} />}
    </div>
  )
}
