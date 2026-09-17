import { describe, expect, it } from "vitest"
import type { WorkflowScope } from "@/data/ports"
import { httpSources } from "@/data/http/sources"
import { WORKFLOW_IDS, WORKSPACE } from "./data/keys"

const scopes: readonly WorkflowScope[] = WORKFLOW_IDS.map((workflowId) => ({ workspaceId: WORKSPACE, workflowId }))

describe("mock backend coherence", () => {
  it.each(scopes)("serves every collection endpoint for $workflowId", async (scope) => {
    const shell = await httpSources.workspace.shell(scope)
    expect(shell?.currentWorkflowId).toBe(scope.workflowId)
    await expect(httpSources.schema.graph(scope)).resolves.toBeDefined()
    await expect(httpSources.nodes.overview(scope)).resolves.toBeDefined()
    await expect(httpSources.tests.overview(scope)).resolves.toBeDefined()
    await expect(httpSources.review.queue(scope)).resolves.toBeDefined()
    await expect(httpSources.chat.thread(scope)).resolves.toBeDefined()
    const runs = await httpSources.runs.list(scope)
    expect(runs[0]?.id ?? null).toBe(shell?.latestRun?.id ?? null)
  })

  it("lists every navigable workflow in the shell", async () => {
    const scope = scopes[0]
    expect(scope).toBeDefined()
    const shell = scope === undefined ? null : await httpSources.workspace.shell(scope)
    expect(shell?.workflows.map((workflow) => workflow.id)).toEqual([...WORKFLOW_IDS])
  })

  it.each(scopes)("has a dataflow run for every run chip of $workflowId", async (scope) => {
    const runs = await httpSources.runs.list(scope)
    const dataflows = await Promise.all(runs.map((run) => httpSources.runs.dataflow(scope, run.id)))
    expect(dataflows.map((dataflow) => dataflow?.run.id)).toEqual(runs.map((run) => run.id))
  })

  it("has a detail for every review queue item", async () => {
    const queues = await Promise.all(scopes.map(async (scope) => ({ scope, queue: await httpSources.review.queue(scope) })))
    const details = await Promise.all(
      queues.flatMap(({ scope, queue }) => queue.map((item) => httpSources.review.detail(scope, item.id))),
    )
    expect(details.every((detail) => detail !== null)).toBe(true)
  })
})
