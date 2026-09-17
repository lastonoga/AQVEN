import { Plus } from "lucide-react"
import { useTranslations } from "use-intl"
import type { RowId, TestDetail } from "@/domain"
import { Matrix, Surface, Text, TitledPanel } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { datasetMeta, failureCount } from "./dataset"
import { useDatasetFields } from "./dataset-fields"
import { FailuresToggle } from "./failures-toggle"
import { filterFailures } from "./navigation"
import { SelectRowLink } from "./select-row-link"

export type RowTableProps = { readonly detail: TestDetail; readonly rowId: RowId | null; readonly failures: boolean }

export function DatasetSection({ detail, rowId, failures }: RowTableProps) {
  const t = useTranslations("testDetail")
  const fields = useDatasetFields(detail.dataset)
  const trailing = (
    <>
      <FailuresToggle count={failureCount(detail.summary)} failures={failures} />
      <Button variant="outline" size="xs" onClick={noop}>
        <Plus aria-hidden />
        {t("dataset.addRow")}
      </Button>
    </>
  )
  return (
    <TitledPanel
      size="block"
      title={t("dataset.title")}
      description={
        <Text role="small" tone="neutral">
          {datasetMeta(detail.dataset, t)}
        </Text>
      }
      trailing={trailing}
      className="mb-6.5"
    >
      <Matrix
        orientation="rows"
        label={t("dataset.title")}
        items={filterFailures(detail.dataset.rows, failures)}
        itemKey={(row) => row.id}
        fields={fields}
        selected={(row) => row.id === rowId}
        rowLink={(row) => <SelectRowLink rowId={row.id} />}
      />
      <Surface variant="footer">
        <Button variant="ghost" size="inline" className="w-full justify-start px-2.5 py-1.25" onClick={noop}>
          <Text role="meta" weight="normal">
            {t("dataset.showAll", { count: detail.dataset.rowCount })}
          </Text>
        </Button>
      </Surface>
    </TitledPanel>
  )
}
