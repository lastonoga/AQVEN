import { useTranslations } from "use-intl"
import type { RowResult } from "@/domain"
import type { MatrixField } from "@/components/studio"
import { CellText } from "./cell-text"
import { RESULT_VALUE, type ResultColumn } from "./dataset"
import { VerdictCell } from "./verdict-tag"

type NumericSpec = { readonly id: ResultColumn; readonly track: string }

const NUMERIC_COLUMNS: readonly NumericSpec[] = [
  { id: "iterations", track: "92px" },
  { id: "calls", track: "96px" },
  { id: "cost", track: "96px" },
  { id: "time", track: "86px" },
  { id: "delta", track: "72px" },
]

export const useResultFields = (): readonly MatrixField<RowResult>[] => {
  const t = useTranslations("testDetail.results.column")
  return [
    { id: "index", label: t("index"), track: "52px", render: (result) => <CellText>{result.rowId}</CellText> },
    { id: "result", label: t("result"), track: "92px", render: (result) => <VerdictCell verdict={result.verdict} align="start" /> },
    { id: "selectedBranch", label: t("selectedBranch"), render: (result) => <CellText>{result.selectedBranch}</CellText> },
    ...NUMERIC_COLUMNS.map(
      ({ id, track }): MatrixField<RowResult> => ({
        id,
        label: t(id),
        track,
        align: "end",
        render: (result) => <CellText>{RESULT_VALUE[id](result)}</CellText>,
      }),
    ),
  ]
}
