import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ExperimentCheck, ExperimentDetail, ExperimentQuestion, MetricColumn } from "@/domain"
import { Heading, Matrix, Tag, Text, TitledPanel, type MatrixField } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { useBuiltinNames } from "./copy"
import { ResearchSection } from "./layout"
import { directionGlyph, marginText, metricName, metricValue } from "./metrics"
import { builtinMetrics, questionMetrics, sourceDetail, type SourceCopy } from "./presenters"

const CHECKS_MIN_WIDTH = 760
const METRICS_MIN_WIDTH = 600
const LIST_JOIN = ", "

function useSourceCopy(): SourceCopy {
  const t = useTranslations("research.experiment.measure")
  return {
    builtin: (use, fields) => t("builtinDetail", { use, fields }),
    builtinAll: (use) => t("builtinAll", { use }),
    judge: (inference, agent, model) => t("judgeDetail", { inference, agent, model }),
    judgeAgentless: (inference) => t("judgeAgentless", { inference }),
  }
}

function CheckTrust({ check }: { readonly check: ExperimentCheck }) {
  const t = useTranslations("research.experiment.measure")
  const { source } = check
  if (source.kind !== "judge") {
    return (
      <Text role="cell" tone="neutral">
        {t("noTrust")}
      </Text>
    )
  }
  if (source.validatedBy === null) {
    return (
      <Tag size="xs" tone="warning">
        {t("unvalidated")}
      </Tag>
    )
  }
  return (
    <Text role="link" tone="success" asChild>
      <Link to={ROUTE_PATH.experiment} params={{ experimentId: source.validatedBy }}>
        {t("validatedBy", { experiment: source.validatedBy })}
      </Link>
    </Text>
  )
}

function useCheckFields(): readonly MatrixField<ExperimentCheck>[] {
  const t = useTranslations("research")
  const source = useSourceCopy()
  return [
    {
      id: "check",
      label: t("experiment.measure.column.check"),
      track: "minmax(120px,0.8fr)",
      render: (check) => (
        <Text as="div" role="cell" tone="default" weight="semibold" truncate>
          {check.id}
        </Text>
      ),
    },
    {
      id: "kind",
      label: t("experiment.measure.column.kind"),
      track: "96px",
      render: (check) => (
        <Text role="hint" tone="neutral">
          {t(`vocabulary.checkKind.${check.kind}`)}
        </Text>
      ),
    },
    {
      id: "source",
      label: t("experiment.measure.column.source"),
      track: "88px",
      render: (check) => (
        <Tag size="xs" tone={check.source.kind === "judge" ? "llm" : "neutral"} fill="outline">
          {t(`vocabulary.checkSource.${check.source.kind}`)}
        </Tag>
      ),
    },
    {
      id: "detail",
      label: t("experiment.measure.column.detail"),
      track: "minmax(220px,2fr)",
      render: (check) => (
        <Text as="div" role="cell" tone="neutral" className="wrap-anywhere">
          {sourceDetail(check.source, source)}
        </Text>
      ),
    },
    { id: "trust", label: t("experiment.measure.column.trust"), track: "minmax(160px,1fr)", render: (check) => <CheckTrust check={check} /> },
  ]
}

const marginOf = (column: MetricColumn, question: ExperimentQuestion, threshold: (bound: string, value: string, margin: string) => string): string | null => {
  if (question.kind === "threshold" && column.role === "primary") {
    return threshold(question.bound, metricValue(question.value, column.unit), marginText(question.margin, column.unit, false))
  }
  if (column.margin === null) return null
  return marginText(column.margin, column.unit, column.relative)
}

function useMetricFields(question: ExperimentQuestion): readonly MatrixField<MetricColumn>[] {
  const t = useTranslations("research")
  const builtin = useBuiltinNames()
  const threshold = (bound: string, value: string, margin: string): string => t("experiment.measure.thresholdMargin", { bound, value, margin })
  return [
    {
      id: "metric",
      label: t("experiment.measure.column.metric"),
      track: "minmax(160px,1fr)",
      render: (column) => (
        <Text as="div" role="cell" tone="default" weight="semibold" truncate>
          {metricName(column.id, builtin)}
        </Text>
      ),
    },
    {
      id: "role",
      label: t("experiment.measure.column.role"),
      track: "104px",
      render: (column) => (
        <Tag size="xs" tone={column.role === "primary" ? "primary" : "neutral"} fill="outline">
          {t(`vocabulary.metricRole.${column.role}`)}
        </Tag>
      ),
    },
    {
      id: "direction",
      label: t("experiment.measure.column.direction"),
      track: "minmax(140px,0.8fr)",
      render: (column) => (
        <Text role="hint" tone="neutral">
          {`${directionGlyph(column.direction)} ${t(`vocabulary.direction.${column.direction}`)}`}
        </Text>
      ),
    },
    {
      id: "margin",
      label: t("experiment.measure.column.margin"),
      track: "minmax(140px,1fr)",
      render: (column) => (
        <Text as="div" role="cell" tone="default">
          {marginOf(column, question, threshold) ?? t("experiment.measure.noMargin")}
        </Text>
      ),
    },
  ]
}

function QuestionMetrics({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.measure")
  const builtin = useBuiltinNames()
  const fields = useMetricFields(experiment.question)
  const metrics = questionMetrics(experiment.metrics)
  const builtinsLine = t("builtins", { list: builtinMetrics(experiment.metrics).map((column) => metricName(column.id, builtin)).join(LIST_JOIN) })
  if (metrics.length === 0) return <Heading size="block" title={t("metrics")} below={[t("noQuestionMetrics"), builtinsLine]} />
  return (
    <TitledPanel size="block" title={t("metrics")} below={[builtinsLine]} scroll>
      <Matrix orientation="rows" rules="rows" label={t("metricsAria")} minWidth={METRICS_MIN_WIDTH} items={metrics} itemKey={(column) => column.id} fields={fields} />
    </TitledPanel>
  )
}

export function ExperimentMeasure({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.measure")
  const fields = useCheckFields()
  return (
    <ResearchSection title={t("title")}>
      <TitledPanel size="block" title={t("checks")} scroll>
        <Matrix orientation="rows" rules="rows" label={t("checksAria")} minWidth={CHECKS_MIN_WIDTH} items={experiment.checks} itemKey={(check) => check.id} fields={fields} />
      </TitledPanel>
      <QuestionMetrics experiment={experiment} />
    </ResearchSection>
  )
}
