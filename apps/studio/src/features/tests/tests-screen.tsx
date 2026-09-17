import { useTranslations } from "use-intl"
import { Actions, Matrix, Page, RowLink, TitledPanel, type ActionSpec } from "@/components/studio"
import { ROUTE_PATH, testsRouteApi } from "@/lib/routes"
import { useDatasetFields } from "./dataset-fields"
import { useTestFields } from "./test-fields"

export function TestsScreen() {
  const { overview } = testsRouteApi.useLoaderData()
  const params = testsRouteApi.useParams()
  const t = useTranslations("tests")
  const common = useTranslations("common")
  const testFields = useTestFields(overview.datasets, params)
  const datasetFields = useDatasetFields()
  const upload: ActionSpec = { id: "upload", label: common("actions.uploadSpreadsheet"), variant: "outline" }
  const testActions: readonly ActionSpec[] = [upload, { id: "new", label: t("actions.newTest"), variant: "default" }]
  const datasetActions: readonly ActionSpec[] = [
    upload,
    { id: "agent", label: t("datasets.buildWithAgent"), variant: "outline" },
    { id: "new", label: t("datasets.newDataset"), variant: "default" },
  ]
  return (
    <Page width="md">
      <TitledPanel
        size="section"
        title={t("title")}
        trailing={<Actions actions={testActions} />}
        surface="raised"
        scroll
        empty={overview.tests.length === 0 ? common("empty.tests") : null}
      >
        <Matrix
          orientation="rows"
          rules="rows"
          label={t("title")}
          items={overview.tests}
          itemKey={(test) => test.id}
          fields={testFields}
          rowLink={(test) => <RowLink to={ROUTE_PATH.testDetail} params={{ ...params, testId: test.id }} aria-label={test.id} tabIndex={-1} />}
        />
      </TitledPanel>
      <TitledPanel
        size="section"
        className="mt-7"
        title={t("datasets.title")}
        trailing={<Actions actions={datasetActions} />}
        surface="raised"
        scroll
        empty={overview.datasets.length === 0 ? common("empty.datasets") : null}
      >
        <Matrix
          orientation="rows"
          rules="rows"
          label={t("datasets.title")}
          items={overview.datasets}
          itemKey={(dataset) => dataset.id}
          fields={datasetFields}
        />
      </TitledPanel>
    </Page>
  )
}
