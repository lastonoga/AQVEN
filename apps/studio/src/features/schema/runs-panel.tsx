import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { RunId, RunSummary } from "@/domain"
import { Matrix, RowLink, Surface, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { runRef } from "@/lib/format"
import { ROUTE_PATH, schemaRouteApi } from "@/lib/routes"
import { useRunFields } from "./use-run-fields"

export type RunsPanelProps = { readonly runs: readonly RunSummary[]; readonly currentRunId: RunId | null }

const RUNS_MIN_WIDTH = 740

const runSearch = (runId: RunId | null): { readonly run?: RunId } => (runId === null ? {} : { run: runId })

export function RunsPanel({ runs, currentRunId }: RunsPanelProps) {
  const t = useTranslations("schema.runs")
  const params = schemaRouteApi.useParams()
  const fields = useRunFields(currentRunId)
  return (
    <Surface variant="plain" className="flex h-full min-h-0 flex-col">
      <Surface variant="bar" asChild>
        <Toolbar
          size="md"
          wrap
          className="flex-none"
          end={
            <Button variant="outline" size="xs" asChild>
              <Link to={ROUTE_PATH.dataflow} params={params} search={runSearch(currentRunId)}>
                {t("openDataflow")}
              </Link>
            </Button>
          }
        >
          <Text role="prose" weight="semibold">
            {t("title")}
          </Text>
          <Text role="hint" tone="neutral">
            {t("hint")}
          </Text>
        </Toolbar>
      </Surface>
      <div className="min-h-0 flex-1 overflow-auto">
        <Matrix
          orientation="rows"
          rules="columns"
          label={t("title")}
          stickyHeader
          minWidth={RUNS_MIN_WIDTH}
          items={runs}
          itemKey={(run) => run.id}
          fields={fields}
          rowLink={(run) => <RowLink to={ROUTE_PATH.dataflow} params={params} search={{ run: run.id }} aria-label={runRef(run.id)} />}
        />
      </div>
    </Surface>
  )
}
