import { describe, expect, it } from "vitest"
import type { CallColumn, MatrixGroup, StageRun } from "@/domain"
import { callDetails } from "./data/calls"
import { catalogOf, findCatalogNode } from "./data/catalog"
import { dataflowRuns } from "./data/dataflow"
import { WORKFLOW_IDS, workflowKey } from "./data/keys"
import { contracts, nodesOverviews } from "./data/nodes"
import { reviewDetails, reviewQueues } from "./data/review"
import { runLists } from "./data/run-list"
import { inspections, schemaGraphs } from "./data/schema"
import { rowTraces } from "./data/test-detail"
import { testsOverviews } from "./data/tests"
import { shells } from "./data/workspace"
import { READS } from "./handlers"

const DESIGN_RUNS: ReadonlySet<string> = new Set(["8247"])
const DESIGN_CALLS: ReadonlySet<string> = new Set(["call_01HT9"])
const USD_TOLERANCE = 0.002
const SECONDS_TOLERANCE = 0.05
const MAX_CALL_ID_LENGTH = 14

const groupColumns = (group: MatrixGroup): readonly CallColumn[] =>
  group.columns.flatMap((column) => [column, ...(column.child === undefined ? [] : groupColumns(column.child.block.group))])

const stageColumns = (stages: readonly StageRun[]): readonly CallColumn[] => stages.flatMap((stage) => stage.groups.flatMap(groupColumns))

type ColumnSite = { readonly path: string; readonly column: CallColumn }

const groupPaths = (group: MatrixGroup, parent: string): readonly ColumnSite[] =>
  group.columns.flatMap((column) => {
    const path = `${parent}/${column.id}`
    return [{ path, column }, ...(column.child === undefined ? [] : groupPaths(column.child.block.group, path))]
  })

const stagePaths = (stages: readonly StageRun[]): readonly ColumnSite[] =>
  stages.flatMap((stage) => stage.groups.flatMap((group) => groupPaths(group, `${stage.id}/${group.id}`)))

const workflowOfKey = (key: string): string => key.split("/")[1] ?? ""

const overviewRow = (workflow: string, node: string, key: string): string | undefined =>
  inspections[workflowKey(workflow, node)]?.overview.find((row) => row.key === key)?.value

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

const groupCost = (group: MatrixGroup): number => group.summary?.totalUsd ?? sum(group.columns.map((column) => column.agent?.costUsd ?? 0))

describe("mock backend node catalog", () => {
  it.each(WORKFLOW_IDS)("draws exactly the catalog nodes on the %s canvas", (workflow) => {
    const drawn = new Set(schemaGraphs[workflowKey(workflow)]?.nodes.flatMap((node) => (node.type === "step" ? [node.data.name] : [])))
    expect([...drawn].sort()).toEqual(catalogOf(workflow).nodes.map((node) => node.id).sort())
  })

  it.each(WORKFLOW_IDS)("lists only canvas nodes on the %s Nodes screen, with catalog kind and stage", (workflow) => {
    const listed = nodesOverviews[workflowKey(workflow)]?.nodes ?? []
    const mismatched = listed.filter((node) => {
      const entry = findCatalogNode(workflow, node.id)
      return entry?.kind !== node.kind || entry.stage !== node.stage
    })
    expect(mismatched.map((node) => node.id)).toEqual([])
  })

  it.each(WORKFLOW_IDS)("has a contract matching the inspection of every inspectable %s step", (workflow) => {
    const steps = schemaGraphs[workflowKey(workflow)]?.nodes.flatMap((node) => (node.type === "step" && node.data.inspectable ? [node.id] : [])) ?? []
    const broken = steps.filter((id) => {
      const entry = findCatalogNode(workflow, id)
      const contract = contracts[workflowKey(workflow, id)]
      const inspection = inspections[workflowKey(workflow, id)]
      const modelHolds = entry?.model === undefined || (overviewRow(workflow, id, "model") === entry.model.model && contract?.profile?.ref.model === entry.model.model)
      return contract?.kind !== entry?.kind || inspection?.kind !== entry?.kind || contract?.stage !== entry?.stage || !modelHolds
    })
    expect(broken).toEqual([])
    const staged = steps.filter((id) => !(overviewRow(workflow, id, "stage") ?? "").startsWith(`${String(findCatalogNode(workflow, id)?.stage)} ·`))
    expect(staged).toEqual([])
  })

  it.each(WORKFLOW_IDS)("numbers canvas stages and the picker from the %s catalog", (workflow) => {
    const stages = catalogOf(workflow).stages
    expect(schemaGraphs[workflowKey(workflow)]?.stages.map((stage) => stage.number)).toEqual(stages.map((stage) => stage.number))
    expect(shells[workflowKey(workflow)]?.workflows.find((summary) => summary.id === workflow)?.stageCount).toBe(stages.length)
  })
})

describe("mock backend runs", () => {
  const runs = Object.entries(dataflowRuns)

  it("resolves every dataflow and trace column to a catalog node with its model", () => {
    const traces = Object.entries(rowTraces).map(([key, trace]) => [key, trace.steps] as const)
    const broken = [...runs.map(([key, run]) => [key, run.stages] as const), ...traces].flatMap(([key, stages]) =>
      stageColumns(stages).flatMap((column) => {
        const entry = findCatalogNode(workflowOfKey(key), column.nodeId ?? "")
        const title = column.agent?.title
        const model = title?.kind === "model" ? title.model : entry?.model?.model
        return entry === undefined || !(model ?? "").startsWith(entry.model?.model ?? "") ? [`${key}/${column.id}`] : []
      }),
    )
    expect(broken).toEqual([])
  })

  it("numbers run stages from the catalog", () => {
    const broken = runs.flatMap(([key, run]) =>
      run.stages.flatMap((stage) => {
        const entry = catalogOf(workflowOfKey(key)).stages.find((item) => item.id === stage.id)
        return entry !== undefined && entry.number === stage.ordinal && entry.title === stage.title ? [] : [`${key}/${stage.id}`]
      }),
    )
    expect(broken).toEqual([])
  })

  it("sums every stage cost from its cells", () => {
    const broken = runs.flatMap(([key, run]) =>
      run.stages.flatMap((stage) => (Math.abs(stage.costUsd - sum(stage.groups.map(groupCost))) <= USD_TOLERANCE ? [] : [`${key}/${stage.id}`])),
    )
    expect(broken).toEqual([])
  })

  it("bills and times each run as the sum of its stages", () => {
    const broken = runs
      .filter(([, run]) => !DESIGN_RUNS.has(run.run.id))
      .filter(([, run]) => {
        const cost = sum(run.stages.map((stage) => stage.costUsd))
        const time = sum(run.stages.map((stage) => stage.durationS ?? 0)) + run.metrics.time.traceGapS
        return Math.abs(cost - run.run.costUsd) > USD_TOLERANCE || Math.abs(time - run.run.durationS) > SECONDS_TOLERANCE
      })
      .map(([key]) => key)
    expect(broken).toEqual([])
  })

  it("keeps run metrics equal to the run summary", () => {
    const broken = runs.filter(([, run]) => run.metrics.cost.valueUsd !== run.run.costUsd || run.metrics.assertions.passed !== run.run.assertions.passed)
    expect(broken.map(([key]) => key)).toEqual([])
  })
})

describe("mock backend calls", () => {
  const details = Object.entries(callDetails)

  it("names a catalog node and its model in every call sheet", () => {
    const broken = details
      .filter(([, detail]) => !DESIGN_CALLS.has(detail.id))
      .filter(([key, detail]) => {
        const entry = findCatalogNode(workflowOfKey(key), detail.nodeId)
        return entry === undefined || entry.kind !== detail.kind || (entry.model !== undefined && entry.model.model !== detail.model.model)
      })
      .map(([key]) => key)
    expect(broken).toEqual([])
  })

  it("keeps call ids short and unique within a workflow", () => {
    const long = details.filter(([, detail]) => detail.id.length > MAX_CALL_ID_LENGTH).map(([key]) => key)
    expect(long).toEqual([])
    const sources = [...Object.entries(dataflowRuns).map(([key, run]) => [key, run.stages] as const), ...Object.entries(rowTraces).map(([key, trace]) => [key, trace.steps] as const)]
    const sites = sources.flatMap(([key, stages]) => stagePaths(stages).map(({ path, column }) => ({ id: `${workflowOfKey(key)}/${column.callId}`, site: `${key}/${path}` })))
    const owners = new Map<string, Set<string>>()
    sites.filter((site) => !DESIGN_CALLS.has(site.id.split("/")[1] ?? "")).forEach((site) => owners.set(site.id, (owners.get(site.id) ?? new Set()).add(site.site)))
    expect([...owners].filter(([, owned]) => owned.size > 1).map(([id]) => id)).toEqual([])
  })
})

describe("mock backend references", () => {
  it("points review items at listed runs and catalog nodes", () => {
    const broken = Object.entries(reviewQueues).flatMap(([key, queue]) =>
      queue.flatMap((item) => {
        const listed = runLists[key]?.some((run) => run.id === item.runId) ?? false
        const entry = findCatalogNode(workflowOfKey(key), item.nodeId)
        const detail = reviewDetails[`${key}/${item.id}`]
        const called = findCatalogNode(workflowOfKey(key), detail?.call.nodeId ?? "")
        return listed && entry?.stage === item.stage && called?.model?.model === detail?.call.model ? [] : [item.id]
      }),
    )
    expect(broken).toEqual([])
  })

  it("cites listed runs as dataset sources", () => {
    const broken = Object.entries(testsOverviews).flatMap(([key, overview]) =>
      overview.datasets.flatMap((dataset) => {
        if (dataset.source.kind !== "agent") return []
        const listed = new Set(runLists[key]?.map((run) => run.id))
        return listed.has(dataset.source.fromRun) && listed.has(dataset.source.toRun) ? [] : [dataset.id]
      }),
    )
    expect(broken).toEqual([])
  })

  it("serves only JSON-serializable tables", () => {
    expect(JSON.parse(JSON.stringify(READS))).toStrictEqual(READS)
  })
})
