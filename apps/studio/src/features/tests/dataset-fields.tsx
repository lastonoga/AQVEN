import { useTranslations } from "use-intl"
import { Actions, Heading, MetaLine, Text, type ActionSpec, type MatrixField } from "@/components/studio"
import type { DatasetSummary } from "@/domain"
import { useRelativeTime } from "@/i18n/format"
import { presentDatasetSummary, presentSource } from "./presenters"

export const useDatasetFields = (): readonly MatrixField<DatasetSummary>[] => {
  const t = useTranslations("tests")
  const common = useTranslations("common")
  const relativeTime = useRelativeTime("long")
  const rowActions: readonly ActionSpec[] = [
    { id: "open", label: common("actions.open"), variant: "outline" },
    { id: "run", label: common("actions.run"), variant: "default" },
  ]
  return [
    {
      id: "dataset",
      label: t("datasets.columns.dataset"),
      track: "minmax(0,1.2fr)",
      render: (dataset) => (
        <Heading
          size="item"
          titleAs="div"
          title={dataset.id}
          below={[
            <Text key="summary" as="div" role="meta" truncate>
              <MetaLine parts={presentDatasetSummary(dataset, t)} />
            </Text>,
          ]}
        />
      ),
    },
    {
      id: "source",
      label: t("datasets.columns.source"),
      track: "minmax(0,1.2fr)",
      render: (dataset) => (
        <Text as="div" role="cell" tone="neutral" truncate>
          <MetaLine parts={presentSource(dataset.source, t)} />
        </Text>
      ),
    },
    {
      id: "assertions",
      label: t("datasets.columns.assertions"),
      track: "minmax(0,1fr)",
      render: (dataset) => (
        <Text role="meta" tone="neutral">
          {t("datasets.assertions", { count: dataset.assertionCount })}
        </Text>
      ),
    },
    {
      id: "usedBy",
      label: t("datasets.columns.usedBy"),
      track: "110px",
      align: "end",
      render: (dataset) => (
        <Text role="meta" tone="neutral">
          {t("datasets.usedBy", { count: dataset.usedByTestCount })}
        </Text>
      ),
    },
    {
      id: "updated",
      label: t("datasets.columns.updated"),
      track: "150px",
      align: "end",
      render: (dataset) => (
        <Text role="meta" tone="neutral">
          {relativeTime(dataset.updatedAt)}
        </Text>
      ),
    },
    {
      id: "actions",
      label: common("columns.actions"),
      track: "170px",
      align: "end",
      render: () => (
        <div className="flex justify-end gap-1.5">
          <Actions actions={rowActions} />
        </div>
      ),
    },
  ]
}
