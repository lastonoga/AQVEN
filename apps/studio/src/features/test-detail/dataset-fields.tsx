import { VisuallyHidden } from "radix-ui"
import { useTranslations } from "use-intl"
import type { Dataset, DatasetColumn, DatasetRow } from "@/domain"
import type { MatrixField } from "@/components/studio"
import { CellText } from "./cell-text"
import { datasetValue, valueTrack, type Quote } from "./dataset"
import { VerdictCell } from "./verdict-tag"

const valueField = (dataset: Dataset, column: DatasetColumn, quote: Quote): MatrixField<DatasetRow> => ({
  id: `value:${column.key}`,
  label: column.label,
  verbatim: true,
  ...valueTrack(dataset.rows, column.key),
  render: (row) => <CellText>{datasetValue(column.key, row.values[column.key], quote)}</CellText>,
})

export const useDatasetFields = (dataset: Dataset): readonly MatrixField<DatasetRow>[] => {
  const t = useTranslations("testDetail.dataset.column")
  const common = useTranslations("common")
  const quote: Quote = (text) => common("quoted", { text })
  return [
    { id: "index", label: t("index"), verbatim: true, track: "48px", render: (row) => <CellText>{row.id}</CellText> },
    ...dataset.columns.map((column) => valueField(dataset, column, quote)),
    {
      id: "assertions",
      label: t("assertions"),
      verbatim: true,
      track: "84px",
      align: "end",
      render: (row) => <CellText>{row.assertionCount}</CellText>,
    },
    {
      id: "verdict",
      label: <VisuallyHidden.Root>{t("verdictAria")}</VisuallyHidden.Root>,
      track: "76px",
      align: "end",
      render: (row) => <VerdictCell verdict={row.verdict} align="end" />,
    },
  ]
}
