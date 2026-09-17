import { useTranslations } from "use-intl"
import { Matrix, Text, TitledPanel } from "@/components/studio"
import { failureCount } from "./dataset"
import type { RowTableProps } from "./dataset-section"
import { FailuresToggle } from "./failures-toggle"
import { filterFailures } from "./navigation"
import { useResultFields } from "./result-fields"
import { SelectRowLink } from "./select-row-link"

export function ResultsSection({ detail, rowId, failures }: RowTableProps) {
  const t = useTranslations("testDetail.results")
  const fields = useResultFields()
  return (
    <TitledPanel
      size="block"
      title={t("title")}
      description={
        <Text role="meta" tone="neutral" truncate>
          {t("description")}
        </Text>
      }
      trailing={<FailuresToggle count={failureCount(detail.summary)} failures={failures} />}
      className="mb-3"
    >
      <Matrix
        orientation="rows"
        label={t("title")}
        items={filterFailures(detail.results, failures)}
        itemKey={(result) => result.rowId}
        fields={fields}
        selected={(result) => result.rowId === rowId}
        rowLink={(result) => <SelectRowLink rowId={result.rowId} />}
      />
    </TitledPanel>
  )
}
