import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import type { ExperimentDetail, ExperimentQuestion, MetricColumn } from "@/domain"
import { Expander, Surface, Text } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { useBuiltinNames, useSubjectCopy } from "./copy"
import { FactList, type Fact } from "./layout"
import { directionGlyph, marginText, metricName, metricValue } from "./metrics"
import { questionMetrics, subjectText } from "./presenters"

const LIST_JOIN = "; "

type Listed = { readonly id: string; readonly file: string | null }

const listedText = (items: readonly Listed[]): string => items.map((item) => joinMeta([item.id, item.file])).join(LIST_JOIN)

function useMetricText(question: ExperimentQuestion): (column: MetricColumn) => string {
  const t = useTranslations("research")
  const builtin = useBuiltinNames()
  return (column) => {
    const threshold =
      question.kind === "threshold" && column.role === "primary"
        ? t("experiment.details.threshold", { bound: question.bound, value: metricValue(question.value, column.unit), margin: marginText(question.margin, column.unit, false) })
        : null
    const margin = column.margin === null ? null : t("experiment.details.margin", { margin: marginText(column.margin, column.unit, column.relative) })
    return joinMeta([`${metricName(column.id, builtin)} ${directionGlyph(column.direction)}`, t(`vocabulary.metricRole.${column.role}`), threshold ?? margin])
  }
}

function useFacts(experiment: ExperimentDetail): readonly Fact[] {
  const t = useTranslations("research")
  const subject = useSubjectCopy()
  const metric = useMetricText(experiment.question)
  const metrics = questionMetrics(experiment.metrics).map(metric)
  const plain = (id: string, label: string, value: string): Fact => ({
    id,
    label,
    value: (
      <Text role="data" tone="default" className="wrap-anywhere">
        {value}
      </Text>
    ),
  })
  const listed = (id: string, label: string, items: readonly Listed[]): readonly Fact[] => (items.length === 0 ? [] : [plain(id, label, listedText(items))])
  return [
    plain("files", t("experiment.details.files"), joinMeta([experiment.files.spec, experiment.files.notes])),
    ...listed("flows", t("experiment.details.flows"), experiment.flows.map((flow) => ({ id: flow.id, file: flow.file }))),
    ...listed("alternatives", t("experiment.details.alternatives"), experiment.alternatives.map((item) => ({ id: item.id, file: item.file }))),
    ...listed("prompts", t("experiment.details.prompts"), experiment.prompts.map((item) => ({ id: item.name, file: item.file }))),
    plain("question", t("experiment.details.question"), joinMeta([t(`vocabulary.question.${experiment.question.kind}`), metrics.join(LIST_JOIN)])),
    plain("subject", t("experiment.details.subject"), subjectText(experiment.subject, subject)),
    plain("plan", t("experiment.details.plan"), t("experiment.details.planText", { cases: experiment.plan.cases ?? experiment.cases.selected, repeats: experiment.plan.repeats })),
    ...(experiment.failureMode === null ? [] : [plain("failure", t("experiment.details.failureMode"), experiment.failureMode)]),
  ]
}

function Notes({ notes }: { readonly notes: string | null }) {
  const t = useTranslations("research.experiment.details")
  if (notes === null) return null
  return (
    <Surface variant="well" padding="md" role="region" aria-label={t("notes")}>
      <Text as="div" role="note" tone="default" className="whitespace-pre-wrap">
        {notes}
      </Text>
    </Surface>
  )
}

export function ExperimentDetails({ experiment }: { readonly experiment: ExperimentDetail }) {
  const t = useTranslations("research.experiment.details")
  const id = useId()
  const [open, setOpen] = useState(false)
  const facts = useFacts(experiment)
  return (
    <section aria-label={t("title")} className="flex min-w-0 flex-col items-start gap-3">
      <Expander
        open={open}
        controls={id}
        label={t("title")}
        size="sm"
        onClick={() => {
          setOpen((current) => !current)
        }}
      />
      {open ? (
        <div id={id} className="flex w-full min-w-0 flex-col gap-3">
          <FactList facts={facts} />
          <Notes notes={experiment.notes} />
        </div>
      ) : null}
    </section>
  )
}
