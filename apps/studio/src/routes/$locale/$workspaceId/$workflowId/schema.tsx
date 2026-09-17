import { createFileRoute, stripSearchParams } from "@tanstack/react-router"
import { INSPECTOR_TABS, type InspectorTab, type NodeId } from "@/domain"
import * as ids from "@/data/ids"
import { SchemaScreen } from "@/features/schema"
import { parseEnum, parseFlag, parseId, parsePositiveInt } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type SchemaSearch = {
  readonly node?: NodeId
  readonly tab: InspectorTab
  readonly stage?: number
  readonly legend: boolean
}

const parseNode = parseId(ids.nodeId)
const parseTab = parseEnum(INSPECTOR_TABS)

const parseSchemaSearch = (raw: RawSearch): SchemaSearch => ({
  tab: parseTab(raw["tab"]) ?? "prompt",
  legend: parseFlag(raw["legend"]) ?? false,
  ...optional("node", parseNode(raw["node"])),
  ...optional("stage", parsePositiveInt(raw["stage"])),
})

const SCHEMA_DEFAULTS = parseSchemaSearch({})

const validateSchemaSearch = searchValidator(parseSchemaSearch)

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/schema")({
  validateSearch: validateSchemaSearch,
  search: { middlewares: [stripSearchParams(SCHEMA_DEFAULTS)] },
  loaderDeps: ({ search: { node } }) => ({ node }),
  loader: async ({ context: { sources }, params, deps }) => {
    const [graph, runs, inspection] = await Promise.all([
      sources.schema.graph(params),
      sources.runs.list(params),
      loadWhen(deps.node, (node) => sources.schema.inspect(params, node)),
    ])
    return { graph, runs, inspection }
  },
  component: SchemaScreen,
})
