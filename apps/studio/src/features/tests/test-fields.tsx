import { useTranslations } from "use-intl"
import { MetaLine, Text, type MatrixField } from "@/components/studio"
import type { DatasetSummary, TestSummary } from "@/domain"
import { useRelativeTime } from "@/i18n/format"
import { ratio } from "@/lib/format"
import type { WorkflowParams } from "@/lib/routes"
import { datasetRowCounts, presentDatasetRef } from "./presenters"
import { TestActions, TestCell } from "./test-cells"

export const useTestFields = (datasets: readonly DatasetSummary[], params: WorkflowParams): readonly MatrixField<TestSummary>[] => {
  const t = useTranslations("tests")
  const domain = useTranslations("domain")
  const common = useTranslations("common")
  const relativeTime = useRelativeTime("long")
  const rowCounts = datasetRowCounts(datasets)
  return [
    {
      id: "test",
      label: t("columns.testScope"),
      track: "minmax(0,1.4fr)",
      render: (test) => <TestCell test={test} healthLabel={domain(`outcome.${test.health}`)} t={t} />,
    },
    {
      id: "dataset",
      label: t("columns.dataset"),
      track: "minmax(0,1.2fr)",
      render: (test) => (
        <Text as="div" role="cell" tone="neutral" truncate>
          <MetaLine parts={presentDatasetRef(test.datasetId, rowCounts, t)} />
        </Text>
      ),
    },
    {
      id: "pass",
      label: t("columns.pass"),
      track: "110px",
      align: "end",
      render: (test) => (
        <Text role="item" weight="semibold">
          {ratio(test.pass)}
        </Text>
      ),
    },
    {
      id: "lastRun",
      label: t("columns.lastRun"),
      track: "150px",
      align: "end",
      render: (test) => (
        <Text role="meta" tone="neutral">
          {relativeTime(test.lastRunAt)}
        </Text>
      ),
    },
    {
      id: "actions",
      label: common("columns.actions"),
      track: "170px",
      align: "end",
      render: (test) => (
        <TestActions test={test} params={params} openLabel={common("actions.open")} runLabel={t("actions.runTestAria", { text: test.id })} />
      ),
    },
  ]
}
