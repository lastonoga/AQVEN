import { useTranslations } from "use-intl"
import { PropertyList, Text, TitledPanel, type PropertyRow } from "@/components/studio"
import { count } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import type { DatasetSummary } from "./model"
import { splitsText, usedByText } from "./presenters"

export type DatasetPanelProps = {
  readonly name: string
  readonly dataset: DatasetSummary | null
  readonly className: string
}

type DatasetCopy = { readonly t: Translator<"tests">; readonly none: string }

const datasetRows = (dataset: DatasetSummary, { t, none }: DatasetCopy): readonly PropertyRow[] => [
  { key: t("dataset.cases"), value: count(dataset.cases) },
  { key: t("dataset.splits"), value: splitsText(dataset, none) },
  { key: t("dataset.usedBy"), value: usedByText(dataset, none) },
  { key: t("dataset.file"), value: { text: dataset.path, mono: true } },
]

export function DatasetPanel({ name, dataset, className }: DatasetPanelProps) {
  const t = useTranslations("tests")
  const common = useTranslations("common")
  const copy: DatasetCopy = { t, none: common("none") }
  return (
    <TitledPanel
      size="section"
      className={className}
      title={t("dataset.title")}
      description={name}
      below={[
        <Text key="note" role="caption" tone="neutral">
          {t("dataset.note")}
        </Text>,
      ]}
      surface="raised"
      empty={dataset === null ? t("dataset.missing", { name }) : null}
    >
      {dataset === null ? null : <PropertyList rows={datasetRows(dataset, copy)} variant="grid" />}
    </TitledPanel>
  )
}
