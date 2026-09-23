import { delay, http, HttpResponse, type JsonBodyType, type PathParams } from "msw"
import type { ApiDatasetCase, ApiDatasetSummary, ApiRun, ApiRunSnapshot } from "@/domain"
import { API_BASE } from "@/api/client"
import { liveChatSessions, liveChatStatus } from "./data/chat"
import { liveDatasetCases, liveDatasets } from "./data/datasets"
import { liveNodeDetails, liveNodePrompts, liveNodes } from "./data/nodes"
import { liveFiles, liveFlowDetails, liveFlows, liveProject, livePrompts, liveProviders, liveSecrets, liveTypeDetails, liveTypes } from "./data/project"
import { COMPLETED_RUN_ID, liveExecutionDetails, liveRunEvents, liveRunSnapshots, liveRuns } from "./data/runs"

const LATENCY_MS = 20
const NOT_FOUND = 404
const UNPROCESSABLE = 422
const CREATED = 201
const createdDatasets: ApiDatasetSummary[] = []
const createdDatasetCases = new Map<string, readonly ApiDatasetCase[]>()
const startedRuns: ApiRun[] = []
const startedSnapshots = new Map<string, ApiRunSnapshot>()

const runSnapshot = (runId: string): ApiRunSnapshot | undefined => {
  const recorded = startedSnapshots.get(runId) ?? liveRunSnapshots[runId]
  if (recorded !== undefined) return recorded
  const summary = liveRuns.find((run) => run.run_id === runId)
  if (summary === undefined) return undefined
  return {
    ...summary,
    execution_id: runId,
    dataset_item_id: summary.dataset_item_id ?? null,
    selected_nodes: summary.selected_nodes ?? null,
    context: null,
    spec_version: {
      id: summary.content_hash,
      content_hash: summary.content_hash,
      release_hash: null,
      git_commit: null,
      origin: "working_copy",
      sources: {},
    },
    input_ref: null,
    output_ref: null,
    error: null,
    seed: null,
    cassette_id: null,
    catalog_snapshot_at: null,
    effective_config: {},
    config_hash: "",
    limits: null,
    order: [],
    executions: [],
    human_answers: [],
    trace_id: null,
    last_seq: 0,
  }
}

const DEMO_BLOBS: Readonly<Record<string, string>> = {
  "sha256-0606035923b6e819a36fc2581f0d9bdb78ccfabe8bb6f44a98ac3b2cbd65e3b6": "/demo-media/controller.jpg",
  "sha256-627b3f43f925ca8305175adcbfdaef581de4e48f876356f52b744102fbd27675": "/demo-media/voice.wav",
  "sha256-56e4ab6809017822c002e780d3ad85a74e58457ba23c3a25696f4fa545401c5a": "/demo-media/clip.mp4",
}

const FLOW_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "urgent", "customer"],
  properties: {
    message: { type: "string", maxLength: 4000 },
    urgent: { type: "boolean" },
    customer: { type: "object", properties: { customer_id: { type: "string" } }, required: ["customer_id"] },
  },
}

const text = (params: PathParams, name: string): string => {
  const value = params[name]
  return typeof value === "string" ? value : ""
}

const notFound = (op: string, message: string): Response =>
  HttpResponse.json(
    { ok: false, op, code: "NOT_FOUND", message, problems: [], candidates: [], conflict: null, retry_after_ms: null },
    { status: NOT_FOUND },
  )

const page = <T>(items: readonly T[]) => ({ items, next_cursor: null, total_estimate: items.length })

const namePage = <T extends { readonly name?: string; readonly case_name?: string }>(items: readonly T[], url: URL) => {
  const cursor = url.searchParams.get("cursor")
  const limit = Number(url.searchParams.get("limit") ?? "200")
  const after = items.filter((item) => cursor === null || (item.name ?? item.case_name ?? "") > cursor)
  const chosen = after.slice(0, limit)
  const next = after.length > limit ? chosen.at(-1) : undefined
  return { items: chosen, next_cursor: next === undefined ? null : next.name ?? next.case_name ?? null, total_estimate: items.length }
}

const matchingCases = (datasetId: string, url: URL): readonly ApiDatasetCase[] => {
  const cases = createdDatasetCases.get(datasetId) ?? liveDatasetCases[datasetId] ?? []
  const query = (url.searchParams.get("search") ?? "").toLocaleLowerCase()
  const split = url.searchParams.get("split")
  return [...cases].filter((item) => item.name.toLocaleLowerCase().includes(query) && (split === null || item.metadata?.["split"] === split)).sort((a, b) => a.name.localeCompare(b.name))
}

const served = async (body: JsonBodyType): Promise<Response> => {
  await delay(LATENCY_MS)
  return HttpResponse.json(body)
}

const addressKey = (runId: string, url: URL): string =>
  [
    runId,
    url.searchParams.get("node_id") ?? "",
    url.searchParams.get("branch_key") ?? "",
    url.searchParams.get("iteration") ?? "",
    url.searchParams.get("item_index") ?? "",
  ].join("|")

const waitDeadlines = (run: ApiRun): readonly number[] => run.waits.map((wait) => Date.parse(wait.deadline_at))

const earliestDeadline = (run: ApiRun): number => Math.min(Number.POSITIVE_INFINITY, ...waitDeadlines(run))

const isOverdue = (run: ApiRun): boolean => earliestDeadline(run) < Date.now()

const matchesRun = (run: ApiRun, url: URL): boolean => {
  const flowId = url.searchParams.get("flow_id")
  const status = url.searchParams.get("status")
  const overdue = url.searchParams.get("overdue")
  if (flowId !== null && run.flow_id !== flowId) return false
  if (overdue === "true" && !isOverdue(run)) return false
  return status === null || run.status === status
}

const byDeadline = (left: ApiRun, right: ApiRun): number => earliestDeadline(left) - earliestDeadline(right)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const flowIdOf = (body: unknown): string => {
  if (!isRecord(body)) return ""
  const flowId = body["flow_id"]
  return typeof flowId === "string" ? flowId : ""
}

const datasetContext = (body: unknown): unknown => {
  if (!isRecord(body) || typeof body["dataset_item_id"] !== "string") return null
  const [datasetId, caseName] = body["dataset_item_id"].split("/")
  const cases = createdDatasetCases.get(datasetId ?? "") ?? liveDatasetCases[datasetId ?? ""] ?? []
  return cases.find((item) => item.name === caseName)?.context ?? null
}

const givenContext = (body: unknown): readonly string[] => {
  if (!isRecord(body)) return []
  const context = body["context"] ?? datasetContext(body)
  if (!isRecord(context)) return []
  return Object.entries(context).flatMap(([key, value]) => (typeof value === "string" && value.length > 0 ? [key] : []))
}

const missingContext = (body: unknown): readonly string[] => {
  const flowId = flowIdOf(body)
  const given = givenContext(body)
  const start = isRecord(body) && typeof body["start_node"] === "string" ? body["start_node"] : null
  const end = isRecord(body) && typeof body["end_node"] === "string" ? body["end_node"] : null
  const range = rangeOrder(flowId, start, end)
  const needed = range === null ? liveFlowDetails[flowId]?.context ?? [] : [
    ...(range.includes("record") ? ["date"] : []),
    ...(range.includes("search_kb") ? ["tenant_id"] : []),
  ]
  return needed.filter((key) => !given.includes(key))
}

const contextMissing = (body: unknown, missing: readonly string[]): Response =>
  HttpResponse.json(
    {
      ok: false,
      op: "run_start",
      code: "CONTEXT_MISSING",
      message: `flow ${flowIdOf(body)} needs run context keys: ${missing.join(", ")}; pass them in context, the engine invents none`,
      problems: missing.map((key) => ({
        path: ["context", key],
        code: "CONTEXT_KEY_MISSING",
        message: `flow ${flowIdOf(body)} reads $run.context.${key} and the run was started without it`,
      })),
      candidates: [],
      conflict: { context: missing },
      retry_after_ms: null,
    },
    { status: UNPROCESSABLE },
  )

const sortedRuns = (runs: readonly ApiRun[], url: URL): readonly ApiRun[] =>
  url.searchParams.get("sort") === "deadline_at" ? [...runs].sort(byDeadline) : runs

const scopeOrder = (flowId: string, selected: readonly string[] | null): readonly string[] => {
  const flow = liveFlowDetails[flowId]
  if (flow === undefined || selected === null) return flow?.order ?? []
  const nodes = liveNodes[flowId] ?? []
  const included = new Set(selected)
  const queue = [...selected]
  for (const nodeId of queue) {
    const node = nodes.find((item) => item.node_id === nodeId)
    for (const dependency of node?.upstream ?? []) {
      const upstream = nodes.find((item) => item.node_id === dependency)
      const rootId = upstream?.parent ?? dependency
      if (!flow.order.includes(rootId) || included.has(rootId)) continue
      included.add(rootId)
      queue.push(rootId)
    }
  }
  return flow.order.filter((nodeId) => included.has(nodeId))
}

const rangeOrder = (flowId: string, start: string | null, end: string | null): readonly string[] | null => {
  if (start === null || end === null) return null
  const order = liveFlowDetails[flowId]?.order ?? []
  const first = order.indexOf(start)
  const last = order.indexOf(end)
  return first < 0 || last < first ? [] : order.slice(first, last + 1)
}

export const handlers = [
  http.get(`${API_BASE}/ready`, () => HttpResponse.json({ status: "ready", detail: null })),

  http.get(`${API_BASE}/project`, () => served(liveProject)),

  http.get(`${API_BASE}/files`, ({ request }) => {
    const kind = new URL(request.url).searchParams.get("kind")
    return served(page(kind === null ? liveFiles : liveFiles.filter((file) => file.kind === kind)))
  }),

  http.get(`${API_BASE}/flows`, () => served(page(liveFlows))),

  http.get(`${API_BASE}/flows/:flowId`, ({ params }) => {
    const flow = liveFlowDetails[text(params, "flowId")]
    return flow === undefined ? notFound("flow_get", `flow ${text(params, "flowId")} is not in the project`) : served(flow)
  }),

  http.get(`${API_BASE}/flows/:flowId/schemas`, ({ params }) => {
    const flowId = text(params, "flowId")
    const flow = liveFlowDetails[flowId]
    if (flow === undefined) return notFound("flow_schemas", `flow ${flowId} is not in the project`)
    return served({ flow_id: flowId, input: FLOW_INPUT_SCHEMA, output: {}, context: flow.context, nodes: {} })
  }),

  http.get(`${API_BASE}/flows/:flowId/nodes`, ({ params }) => {
    const nodes = liveNodes[text(params, "flowId")]
    return nodes === undefined ? notFound("flow_nodes", `flow ${text(params, "flowId")} is not in the project`) : served(nodes)
  }),

  http.post(`${API_BASE}/flows/:flowId/run-scope`, async ({ params, request }) => {
    const flowId = text(params, "flowId")
    if (liveFlowDetails[flowId] === undefined) return notFound("flow_run_scope", `flow ${flowId} is not in the project`)
    const body: unknown = await request.json()
    const value = isRecord(body) ? body["selected_nodes"] : null
    const selected = Array.isArray(value) && value.every((item: unknown) => typeof item === "string") ? value : null
    return served({ selected_nodes: selected, order: scopeOrder(flowId, selected) })
  }),

  http.post(`${API_BASE}/flows/:flowId/manual-range`, async ({ params, request }) => {
    const flowId = text(params, "flowId")
    const order = liveFlowDetails[flowId]?.order
    if (order === undefined) return notFound("flow_manual_range", `flow ${flowId} is not in the project`)
    const body: unknown = await request.json()
    const input = isRecord(body) && isRecord(body["input"]) ? body["input"] : {}
    const context = isRecord(body) && isRecord(body["context"]) ? body["context"] : {}
    const outputs = isRecord(body) && isRecord(body["node_outputs"]) ? body["node_outputs"] : {}
    const ranges = order.flatMap((startNode, first) => order.slice(first).map((endNode, offset) => {
      const selected = order.slice(first, first + offset + 1)
      const inputPaths = selected.includes("prepare") ? ["$input"] : selected.includes("triage") ? ["$input.customer.customer_id"] : []
      const contextKeys = [...(selected.includes("record") ? ["date"] : []), ...(selected.includes("search_kb") ? ["tenant_id"] : [])]
      const previous = order[first - 1]
      const nodeOutputPaths = previous === undefined ? [] : [`$${previous}.out`]
      const missing = [
        ...(inputPaths.includes("$input") && Object.keys(input).length === 0 ? [{ reference: "$input", reason: "flow input is empty" }] : []),
        ...(inputPaths.includes("$input.customer.customer_id") && (!isRecord(input["customer"]) || !input["customer"]["customer_id"]) ? [{ reference: "$input.customer.customer_id", reason: "flow input field is missing" }] : []),
        ...contextKeys.filter((key) => !context[key]).map((key) => ({ reference: `$run.context.${key}`, reason: "run context field is missing" })),
        ...(previous !== undefined && outputs[previous] === undefined ? [{ reference: `$${previous}.out`, reason: `output fixture for node ${previous} is missing` }] : []),
      ]
      return { start_node: startNode, end_node: endNode, available: missing.length === 0, input_paths: inputPaths, context_keys: contextKeys, node_output_paths: nodeOutputPaths, missing }
    }))
    return served({ order, ranges })
  }),

  http.post(`${API_BASE}/flows/:flowId/dataset-range`, async ({ params, request }) => {
    const flowId = text(params, "flowId")
    const order = liveFlowDetails[flowId]?.order
    if (order === undefined) return notFound("flow_dataset_range", `flow ${flowId} is not in the project`)
    const body: unknown = await request.json()
    const datasetId = isRecord(body) && typeof body["dataset_id"] === "string" ? body["dataset_id"] : ""
    const names = isRecord(body) && Array.isArray(body["case_names"])
      ? body["case_names"].filter((name): name is string => typeof name === "string")
      : []
    const cases = createdDatasetCases.get(datasetId) ?? liveDatasetCases[datasetId]
    if (cases === undefined) return notFound("flow_dataset_range", `dataset ${datasetId} is not in the project`)
    const selectedCases = names.map((name) => cases.find((item) => item.name === name))
    if (names.length === 0 || selectedCases.some((item) => item === undefined)) {
      return HttpResponse.json({ message: "Select existing dataset cases" }, { status: UNPROCESSABLE })
    }
    return served({
      order,
      ranges: order.flatMap((startNode, first) => order.slice(first).map((endNode) => {
        const missing = names.flatMap((caseName, index) => order.slice(0, first).flatMap((prior) => {
          const outputs = selectedCases[index]?.node_outputs
          return outputs != null && Object.hasOwn(outputs, prior) ? [] : [{
            case_name: caseName,
            reference: `$${prior}.out`,
            reason: `output fixture for node ${prior} is missing`,
          }]
        }))
        return { start_node: startNode, end_node: endNode, available: missing.length === 0, missing }
      })),
    })
  }),

  http.get(`${API_BASE}/flows/:flowId/nodes/:nodeId`, ({ params }) => {
    const key = `${text(params, "flowId")}/${text(params, "nodeId")}`
    const node = liveNodeDetails[key]
    return node === undefined ? notFound("flow_node", `node ${key} is not in the project`) : served(node)
  }),

  http.get(`${API_BASE}/flows/:flowId/nodes/:nodeId/prompt`, ({ params }) => {
    const key = `${text(params, "flowId")}/${text(params, "nodeId")}`
    const prompt = liveNodePrompts[key]
    return prompt === undefined ? notFound("flow_node_prompt", `node ${key} has no prompt`) : served(prompt)
  }),

  http.get(`${API_BASE}/prompts`, ({ request }) => {
    const flowId = new URL(request.url).searchParams.get("flow_id")
    return served(page(flowId === null ? livePrompts : livePrompts.filter((prompt) => prompt.flow_id === flowId)))
  }),

  http.get(`${API_BASE}/types`, () => served(page(liveTypes))),

  http.get(`${API_BASE}/types/:typeId`, ({ params }) => {
    const typeId = text(params, "typeId")
    const detail = liveTypeDetails[typeId]
    return detail === undefined ? notFound("type_get", `type ${typeId} is not in the project registry`) : served(detail)
  }),

  http.get(`${API_BASE}/runs`, ({ request }) => {
    const url = new URL(request.url)
    return served(page(sortedRuns([...startedRuns, ...liveRuns].filter((run) => matchesRun(run, url)), url)))
  }),

  http.post(`${API_BASE}/runs`, async ({ request }) => {
    const body: unknown = await request.json()
    const missing = missingContext(body)
    if (missing.length > 0) return contextMissing(body, missing)
    const template = liveRunSnapshots[COMPLETED_RUN_ID]
    if (template === undefined) return notFound("run_start", "mock run template is unavailable")
    const flowId = flowIdOf(body)
    const selectedValue = isRecord(body) ? body["selected_nodes"] : null
    const selected = Array.isArray(selectedValue) && selectedValue.every((item: unknown) => typeof item === "string") ? selectedValue : null
    const itemId = isRecord(body) && typeof body["dataset_item_id"] === "string" ? body["dataset_item_id"] : ""
    const [datasetId, caseName] = itemId.split("/")
    const cases = createdDatasetCases.get(datasetId ?? "") ?? liveDatasetCases[datasetId ?? ""] ?? []
    const input = cases.find((item) => item.name === caseName)?.inputs
    const contextValue = isRecord(body) ? body["context"] ?? datasetContext(body) : null
    const context = isRecord(contextValue) ? {
      date: typeof contextValue["date"] === "string" ? contextValue["date"] : null,
      time_zone: typeof contextValue["time_zone"] === "string" ? contextValue["time_zone"] : null,
      locale: typeof contextValue["locale"] === "string" ? contextValue["locale"] : null,
      tenant_id: typeof contextValue["tenant_id"] === "string" ? contextValue["tenant_id"] : null,
    } : null
    const runId = crypto.randomUUID()
    const startNode = isRecord(body) && typeof body["start_node"] === "string" ? body["start_node"] : null
    const endNode = isRecord(body) && typeof body["end_node"] === "string" ? body["end_node"] : null
    const order = rangeOrder(flowId, startNode, endNode) ?? scopeOrder(flowId, selected)
    const snapshot: ApiRunSnapshot = {
      ...template,
      run_id: runId,
      execution_id: runId,
      flow_id: flowId,
      status: "running",
      mode: "live",
      started_at: new Date().toISOString(),
      finished_at: null,
      cost_usd: "0",
      tokens_in: 0,
      tokens_out: 0,
      node_counts: { pending: order.length, running: 0, ok: 0, failed: 0, skipped: 0, suspended: 0, cancelled: 0 },
      content_hash: liveFlowDetails[flowId]?.content_hash ?? template.content_hash,
      waits: [],
      lineage: null,
      context,
      dataset_item_id: itemId || null,
      selected_nodes: selected,
      start_node: startNode,
      end_node: endNode,
      input_ref: input === undefined ? null : { kind: "inline", value: input },
      output_ref: null,
      error: null,
      order: [...order],
      executions: [],
      human_answers: [],
      last_seq: 0,
    }
    startedSnapshots.set(runId, snapshot)
    startedRuns.unshift(snapshot)
    return HttpResponse.json(
      {
        run_id: runId,
        status: "running",
        content_hash: snapshot.content_hash,
        spec_version_id: snapshot.spec_version.id,
        last_seq: 0,
        ui_url: "",
        warnings: [],
      },
      { status: CREATED },
    )
  }),

  http.get(`${API_BASE}/runs/:runId`, ({ params }) => {
    const snapshot = runSnapshot(text(params, "runId"))
    return snapshot === undefined ? notFound("run_get", `run ${text(params, "runId")} is unknown`) : served(snapshot)
  }),

  http.post(`${API_BASE}/runs/:runId/presentation`, async ({ params, request }) => {
    const runId = text(params, "runId")
    if (startedSnapshots.get(runId) === undefined && liveRunSnapshots[runId] === undefined) {
      return notFound("run_presentation", `run ${runId} is unknown`)
    }
    const body: unknown = await request.json()
    const values: unknown[] = isRecord(body) && Array.isArray(body["targets"]) ? body["targets"] : []
    const targets = values.filter((target) => isRecord(target) && isRecord(target["address"]) &&
      (target["side"] === "input" || target["side"] === "output"))
    return served({ results: targets.map((target) => ({
      target,
      status: "unavailable",
      document: null,
      formatter: null,
      formatter_version: null,
      error: "No display formatter is configured in the demo run",
    })) })
  }),

  http.get(`${API_BASE}/runs/:runId/executions`, ({ params }) => {
    const snapshot = runSnapshot(text(params, "runId"))
    return snapshot === undefined ? notFound("run_executions", `run ${text(params, "runId")} is unknown`) : served(snapshot.executions)
  }),

  http.get(`${API_BASE}/runs/:runId/executions/detail`, ({ params, request }) => {
    const key = addressKey(text(params, "runId"), new URL(request.url))
    const detail = liveExecutionDetails[key]
    return detail === undefined ? notFound("run_executions_detail", `run has no execution at ${key}`) : served(detail)
  }),

  http.get(`${API_BASE}/runs/:runId/events/log`, ({ params }) => {
    if (startedSnapshots.has(text(params, "runId"))) return served(page([]))
    const events = liveRunEvents[text(params, "runId")]
    if (events !== undefined) return served(page(events))
    return runSnapshot(text(params, "runId")) === undefined
      ? notFound("run_events_log", `run ${text(params, "runId")} is unknown`)
      : served(page([]))
  }),

  http.get(`${API_BASE}/blobs/:blobId`, ({ params, request }) => {
    const blobId = text(params, "blobId")
    const asset = DEMO_BLOBS[blobId]
    return asset === undefined ? served(`blob ${blobId}`) : HttpResponse.redirect(new URL(asset, request.url).href)
  }),

  http.get(`${API_BASE}/datasets`, () => served(page([...liveDatasets, ...createdDatasets]))),

  http.get(`${API_BASE}/datasets/:datasetId`, ({ params }) => {
    const found = [...liveDatasets, ...createdDatasets].find((item) => item.dataset_id === text(params, "datasetId"))
    return found === undefined ? notFound("dataset_get", `dataset ${text(params, "datasetId")} is not in the project`) : served(found)
  }),

  http.get(`${API_BASE}/datasets/:datasetId/cases`, ({ params, request }) => {
    const datasetId = text(params, "datasetId")
    const cases = createdDatasetCases.get(datasetId) ?? liveDatasetCases[datasetId]
    return cases === undefined ? notFound("dataset_cases", `dataset ${datasetId} is not in the project`) : served(namePage(matchingCases(datasetId, new URL(request.url)), new URL(request.url)))
  }),

  http.get(`${API_BASE}/datasets/:datasetId/case-names`, ({ params, request }) => {
    const datasetId = text(params, "datasetId")
    const cases = createdDatasetCases.get(datasetId) ?? liveDatasetCases[datasetId]
    if (cases === undefined) return notFound("dataset_case_names", `dataset ${datasetId} is not in the project`)
    const url = new URL(request.url)
    const names = matchingCases(datasetId, url).map((item) => ({ name: item.name }))
    const result = namePage(names, url)
    return served({ ...result, items: result.items.map((item) => item.name) })
  }),

  http.get(`${API_BASE}/datasets/:datasetId/cases/:caseName`, ({ params }) => {
    const datasetId = text(params, "datasetId")
    const caseName = text(params, "caseName")
    const cases = createdDatasetCases.get(datasetId) ?? liveDatasetCases[datasetId]
    const found = cases?.find((item) => item.name === caseName)
    return found === undefined ? notFound("dataset_case_get", `case ${caseName} is not in dataset ${datasetId}`) : served(found)
  }),

  http.post(`${API_BASE}/datasets/draft`, async ({ request }) => {
    const body: unknown = await request.json()
    const flowId = flowIdOf(body)
    const flow = liveFlowDetails[flowId]
    if (flow === undefined) return notFound("dataset_draft", `flow ${flowId} is not in the project`)
    return served({
      apiVersion: "aqven/v1",
      kind: "Dataset",
      flow: flowId,
      cases: [{
        name: "case_1",
        inputs: { customer: { customer_id: "example" }, message: "Describe the customer request", urgent: false },
        context: Object.fromEntries(flow.context.map((key) => [key, key === "date" ? "2026-09-18" : "example"])),
      }],
    })
  }),

  http.post(`${API_BASE}/datasets`, async ({ request }) => {
    const body: unknown = await request.json()
    if (!isRecord(body) || typeof body["dataset_id"] !== "string" || typeof body["flow_id"] !== "string" || !Array.isArray(body["cases"])) {
      return HttpResponse.json({ message: "Invalid dataset request" }, { status: UNPROCESSABLE })
    }
    const datasetId = body["dataset_id"]
    if ([...liveDatasets, ...createdDatasets].some((item) => item.dataset_id === datasetId)) {
      return HttpResponse.json({ message: `Dataset ${datasetId} already exists` }, { status: 409 })
    }
    const cases: ApiDatasetCase[] = body["cases"].filter(isRecord).map((item) => ({
      name: typeof item["name"] === "string" ? item["name"] : "",
      inputs: isRecord(item["inputs"]) ? item["inputs"] : {},
      context: isRecord(item["context"]) ? item["context"] : null,
      metadata: isRecord(item["metadata"]) ? item["metadata"] : null,
    }))
    const splits: Record<string, number> = {}
    for (const item of cases) {
      const split = item.metadata?.["split"]
      if (typeof split === "string") splits[split] = (splits[split] ?? 0) + 1
    }
    const summary: ApiDatasetSummary = {
      dataset_id: datasetId,
      flow_id: body["flow_id"],
      path: `datasets/${datasetId}.yaml`,
      file_hash: "sha256-demo-created-dataset",
      cases: cases.length,
      splits,
    }
    createdDatasets.push(summary)
    createdDatasetCases.set(datasetId, cases)
    return HttpResponse.json(summary)
  }),

  http.get(`${API_BASE}/chat/status`, () => served(liveChatStatus)),
  http.get(`${API_BASE}/chat/models`, ({ request }) =>
    served({
      backend: new URL(request.url).searchParams.get("backend") === "codex" ? "codex" : "claude",
      models: [
        {
          id: "sonnet",
          display_name: "Sonnet",
          description: "Alias for the latest Sonnet model",
          is_default: false,
          efforts: [{ effort: "low", description: "Short thinking budget" }, { effort: "high", description: "Long thinking budget" }],
          default_effort: "medium",
        },
      ],
      accepts_any_model: true,
      detail: null,
    })),

  http.get(`${API_BASE}/chat/backend`, () => served({ backend: liveChatStatus.backend })),

  http.put(`${API_BASE}/chat/backend`, async ({ request }) => {
    const body: unknown = await request.json()
    return served({ backend: isRecord(body) && body["backend"] === "codex" ? "codex" : "claude" })
  }),

  http.get(`${API_BASE}/chat/sessions`, () => served(page(liveChatSessions))),

  http.post(`${API_BASE}/chat/sessions/:sessionId/messages`, async ({ params, request }) => {
    const sessionId = text(params, "sessionId")
    if (!liveChatSessions.some((item) => item.session_id === sessionId)) return notFound("chat_message_send", `chat session ${sessionId} is unknown`)
    const body: unknown = await request.json()
    const prompt = isRecord(body) && typeof body["text"] === "string" ? body["text"] : ""
    const dataset = /dataset file datasets\/([a-z][a-z0-9_]*)\.yaml for flow ([a-z][a-z0-9_]*)/.exec(prompt)
    if (dataset !== null) {
      const datasetId = dataset[1] ?? ""
      const flowId = dataset[2] ?? ""
      const total = Math.min(20, Math.max(1, Number(/Generate (\d+) distinct/.exec(prompt)?.[1] ?? "3")))
      const scenario = /scenarios: ([^\n]+)/.exec(prompt)?.[1] ?? "Sample customer request"
      const templates = liveDatasetCases["support_case_cases"] ?? []
      const cases: ApiDatasetCase[] = Array.from({ length: total }, (_, index) => {
        const template = templates[index % templates.length]
        return {
          name: `case_${String(index + 1)}`,
          inputs: { ...(isRecord(template?.inputs) ? template.inputs : {}), message: `${scenario} (${String(index + 1)})` },
          context: template?.context ?? { date: "2026-09-18", tenant_id: "lumen" },
        }
      })
      if (flowId === "support_case" && ![...liveDatasets, ...createdDatasets].some((item) => item.dataset_id === datasetId)) {
        createdDatasets.push({
          dataset_id: datasetId,
          flow_id: flowId,
          path: `datasets/${datasetId}.yaml`,
          file_hash: "sha256-demo-generated-dataset",
          cases: cases.length,
          splits: { unassigned: cases.length },
        })
        createdDatasetCases.set(datasetId, cases)
      }
    }
    return HttpResponse.json({ session_id: sessionId, turn_id: crypto.randomUUID() }, { status: 202 })
  }),

  http.get(`${API_BASE}/settings/providers`, () => served(liveProviders)),

  http.get(`${API_BASE}/settings/secrets`, () => served(liveSecrets)),
]
