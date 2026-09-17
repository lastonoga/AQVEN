import { useTranslations } from "use-intl"
import { SplitPane } from "@/components/studio"
import { schemaRouteApi, shellRouteApi } from "@/lib/routes"
import { CanvasColumn } from "./canvas-column"
import { Inspector } from "./inspector"
import { RunsPanel } from "./runs-panel"
import { useStableValue } from "./use-stable-value"
import { useSchemaSearch } from "./use-schema-search"

export function SchemaScreen() {
  const t = useTranslations("schema.resize")
  const search = useSchemaSearch()
  const { graph: loadedGraph, runs, inspection } = schemaRouteApi.useLoaderData()
  const graph = useStableValue(loadedGraph)
  const currentRunId = shellRouteApi.useLoaderData({ select: (data) => data.shell.latestRun?.id ?? null })
  const workspace = (
    <SplitPane
      id="schema-runs"
      orientation="vertical"
      handle="bar"
      handleLabel={t("runsAria")}
      panels={[
        { id: "schema-canvas", content: <CanvasColumn graph={graph} search={search} /> },
        { id: "schema-runs-panel", content: <RunsPanel runs={runs} currentRunId={currentRunId} />, defaultSize: 200, minSize: 96, maxSize: 620, fixed: true },
      ]}
    />
  )
  return (
    <SplitPane
      id="schema-inspector"
      orientation="horizontal"
      handle="line"
      handleLabel={t("inspectorAria")}
      panels={[
        { id: "schema-workspace", content: workspace, minSize: 480 },
        {
          id: "schema-inspector-panel",
          content: <Inspector inspection={inspection} tab={search.tab} onTabChange={search.setTab} />,
          defaultSize: 340,
          minSize: 260,
          maxSize: 560,
          fixed: true,
        },
      ]}
    />
  )
}
