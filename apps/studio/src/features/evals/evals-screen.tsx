import { useTranslations } from "use-intl"
import { Heading, Matrix, Page, RowLink, Text, TitledPanel, type MatrixField } from "@/components/studio"
import { evalsRouteApi, ROUTE_PATH } from "@/lib/routes"
import type { Translator } from "@/i18n/translator"
import { DatasetPanel } from "./dataset-panel"
import { EvalCasesPanel } from "./eval-cases-panel"
import { EvalPanel } from "./eval-panel"
import { EvalRunDetail } from "./eval-run-detail"
import { EvalRunsPanel } from "./eval-runs-panel"
import type { EvalSummary } from "./model"
import { targetText } from "./presenters"

type ListCopy = { readonly t: Translator<"tests"> }

const evalFields = ({ t }: ListCopy): readonly MatrixField<EvalSummary>[] => [
  {
    id: "eval",
    label: t("columns.eval"),
    track: "minmax(0,1.6fr)",
    render: (item) => (
      <Heading
        size="item"
        titleAs="div"
        title={item.eval_id}
        below={[
          <Text key="description" as="div" role="meta" truncate>
            {item.description}
          </Text>,
        ]}
      />
    ),
  },
  {
    id: "target",
    label: t("columns.target"),
    track: "minmax(0,1fr)",
    render: (item) => (
      <Text as="div" role="cell" tone="neutral" truncate>
        {targetText(item)}
      </Text>
    ),
  },
  {
    id: "scorers",
    label: t("columns.scorers"),
    track: "110px",
    align: "end",
    render: (item) => (
      <Text role="meta" tone="neutral">
        {t("scorers.count", { count: item.scorers.length })}
      </Text>
    ),
  },
  {
    id: "dataset",
    label: t("columns.dataset"),
    track: "minmax(0,1fr)",
    render: (item) => (
      <Text as="div" role="cell" tone="neutral" verbatim truncate>
        {item.dataset}
      </Text>
    ),
  },
  {
    id: "file",
    label: t("columns.file"),
    track: "minmax(0,1.2fr)",
    align: "end",
    render: (item) => (
      <Text as="div" role="meta" tone="neutral" verbatim truncate>
        {item.path}
      </Text>
    ),
  },
]

export function EvalsScreen() {
  const { evals, selected, dataset, runs, run, cases, gate, caseName, caseRepeat } = evalsRouteApi.useLoaderData()
  const { flowId } = evalsRouteApi.useParams()
  const t = useTranslations("tests")
  const copy: ListCopy = { t }
  return (
    <Page width="md">
      <TitledPanel
        size="section"
        title={t("title")}
        description={t("subtitle")}
        surface="raised"
        scroll
        empty={evals.length === 0 ? t("empty", { flowId }) : null}
      >
        <Matrix
          orientation="rows"
          rules="rows"
          label={t("title")}
          items={evals}
          itemKey={(item) => item.eval_id}
          fields={evalFields(copy)}
          selected={(item) => item.eval_id === selected?.eval_id}
          rowLink={(item) => (
            <RowLink
              from={ROUTE_PATH.evals}
              to="."
              search={{ eval: item.eval_id }}
              resetScroll={false}
              aria-label={item.eval_id}
              tabIndex={-1}
            />
          )}
        />
      </TitledPanel>
      {selected === null ? null : <EvalPanel className="mt-7" item={selected} />}
      {selected === null ? null : <DatasetPanel className="mt-7" name={selected.dataset} dataset={dataset} />}
      {selected === null ? null : <EvalRunsPanel className="mt-7" evalId={selected.eval_id} runs={runs} current={run} />}
      {run === null ? null : <EvalRunDetail className="mt-7" run={run} gate={gate} />}
      {run === null || selected === null ? null : (
        <EvalCasesPanel
          className="mt-7"
          evalId={selected.eval_id}
          runId={run.eval_run_id}
          cases={cases}
          caseName={caseName}
          caseRepeat={caseRepeat}
        />
      )}
    </Page>
  )
}
