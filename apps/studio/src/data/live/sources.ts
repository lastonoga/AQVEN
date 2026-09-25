import type {
  ApiChatApprovalReply,
  ApiChatBackendKind,
  ApiChatBackendWrite,
  ApiChatMessageRequest,
  ApiChatSessionCreate,
  ApiChatSessionSettings,
  ApiDatasetCreateRequest,
  ApiExecutionAddress,
  ApiFileKind,
  ApiForkRequest,
  ApiIncludePayloads,
  ApiJsonValue,
  ApiPromptPreviewBody,
  ApiResearchBudgetWrite,
  ApiResumeRequest,
  ApiRunStartRequest,
  ApiSettingWrite,
  BlobId,
  ChatSessionId,
  DatasetId,
  FilePath,
  FlowId,
  NodeId,
  RunId,
  RunMode,
  RunStatus,
  SettingKey,
  SettingScope,
  TypeId,
} from "@/domain"
import type { SchemaPresentationResponse, SchemaPresentationTarget, SchemaRunSort } from "@/api/schema"
import { API_BASE, api, unwrap } from "@/api/client"
import { authoring } from "./authoring"
import { everyPage, MAX_PAGE } from "./paging"
import { projectEventStream } from "./project-events"
import { research } from "./research"
import { server } from "./server"

export type RunSort = SchemaRunSort

export type RunFilter = {
  readonly flowId?: FlowId
  readonly status?: RunStatus
  readonly mode?: RunMode
  readonly assignee?: string
  readonly parentRunId?: RunId
  readonly sort?: RunSort
  readonly overdue?: boolean
  readonly limit?: number
}

const DEFAULT_SORT: RunSort = "started_at"

const csvBody = (flowId: FlowId, datasetId: string, file: File): FormData => {
  const form = new FormData()
  form.set("flow_id", flowId)
  form.set("dataset_id", datasetId)
  form.set("file", file)
  return form
}

export type CaseMediaAttach = {
  readonly datasetId: DatasetId
  readonly caseName: string
  readonly location: string
  readonly fileHash: string
  readonly file: File
}

const mediaBody = (attach: CaseMediaAttach): FormData => {
  const form = new FormData()
  form.set("location", attach.location)
  form.set("file_hash", attach.fileHash)
  form.set("file", attach.file, attach.file.name)
  return form
}

const runQuery = (filter: RunFilter) => ({
  flow_id: filter.flowId ?? null,
  status: filter.status ?? null,
  mode: filter.mode ?? null,
  assignee: filter.assignee ?? null,
  parent_run_id: filter.parentRunId ?? null,
  sort: filter.sort ?? DEFAULT_SORT,
  overdue: filter.overdue ?? null,
  limit: filter.limit ?? MAX_PAGE,
})

const addressQuery = (address: ApiExecutionAddress, payloads: ApiIncludePayloads) => ({
  node_id: address.node_id,
  branch_key: address.branch_key,
  iteration: address.iteration,
  item_index: address.item_index,
  include_payloads: payloads,
})

const project = {
  info: async () => unwrap(await api.GET("/api/project")),
  ready: async () => unwrap(await api.GET("/api/ready")),
  flows: async () => unwrap(await api.GET("/api/flows", { params: { query: { limit: MAX_PAGE } } })).items,
  types: async () => unwrap(await api.GET("/api/types", { params: { query: { limit: MAX_PAGE } } })).items,
  type: async (id: TypeId) => unwrap(await api.GET("/api/types/{type_id}", { params: { path: { type_id: id } } })),
  prompts: async (flowId: FlowId | null) =>
    unwrap(await api.GET("/api/prompts", { params: { query: { flow_id: flowId, limit: MAX_PAGE } } })).items,
  files: async (kind: ApiFileKind | null = null) =>
    unwrap(await api.GET("/api/files", { params: { query: { kind, limit: MAX_PAGE } } })).items,
  file: async (path: FilePath) => unwrap(await api.GET("/api/files/{path}", { params: { path: { path } } })),
  raw: async (path: FilePath) => unwrap(await api.GET("/api/raw/{path}", { params: { path: { path } }, parseAs: "text" })),
  events: projectEventStream,
}

const flow = {
  detail: async (flowId: FlowId) => unwrap(await api.GET("/api/flows/{flow_id}", { params: { path: { flow_id: flowId } } })),
  spec: async (flowId: FlowId) => unwrap(await api.GET("/api/flows/{flow_id}/spec", { params: { path: { flow_id: flowId } } })),
  ir: async (flowId: FlowId) => unwrap(await api.GET("/api/flows/{flow_id}/ir", { params: { path: { flow_id: flowId } } })),
  schemas: async (flowId: FlowId) => unwrap(await api.GET("/api/flows/{flow_id}/schemas", { params: { path: { flow_id: flowId } } })),
  nodes: async (flowId: FlowId) => unwrap(await api.GET("/api/flows/{flow_id}/nodes", { params: { path: { flow_id: flowId } } })),
  node: async (flowId: FlowId, nodeId: NodeId) =>
    unwrap(await api.GET("/api/flows/{flow_id}/nodes/{node_id}", { params: { path: { flow_id: flowId, node_id: nodeId } } })),
  nodeDisplayPreview: async (flowId: FlowId, nodeId: NodeId) =>
    unwrap(await api.GET("/api/flows/{flow_id}/nodes/{node_id}/display-preview", { params: { path: { flow_id: flowId, node_id: nodeId } } })),
  prompt: async (flowId: FlowId, nodeId: NodeId) =>
    unwrap(await api.GET("/api/flows/{flow_id}/nodes/{node_id}/prompt", { params: { path: { flow_id: flowId, node_id: nodeId } } })),
  promptPreview: async (flowId: FlowId, nodeId: NodeId, body: ApiPromptPreviewBody) =>
    unwrap(
      await api.POST("/api/flows/{flow_id}/nodes/{node_id}/prompt/preview", {
        params: { path: { flow_id: flowId, node_id: nodeId } },
        body,
      }),
    ),
  runScope: async (flowId: FlowId, selectedNodes: readonly NodeId[] | null) =>
    unwrap(
      await api.POST("/api/flows/{flow_id}/run-scope", {
        params: { path: { flow_id: flowId } },
        body: { selected_nodes: selectedNodes === null ? null : [...selectedNodes] },
      }),
    ),
  datasetRange: async (flowId: FlowId, datasetId: string, caseNames: readonly string[]) =>
    unwrap(await api.POST("/api/flows/{flow_id}/dataset-range", {
      params: { path: { flow_id: flowId } },
      body: { dataset_id: datasetId, case_names: [...caseNames] },
    })),
  manualRange: async (flowId: FlowId, body: { input: ApiJsonValue; context: Record<string, ApiJsonValue>; node_outputs: Record<string, ApiJsonValue> }) =>
    unwrap(await api.POST("/api/flows/{flow_id}/manual-range", {
      params: { path: { flow_id: flowId } },
      body,
    })),
}

const run = {
  list: async (filter: RunFilter) => unwrap(await api.GET("/api/runs", { params: { query: runQuery(filter) } })).items,
  snapshot: async (runId: RunId) => unwrap(await api.GET("/api/runs/{run_id}", { params: { path: { run_id: runId } } })),
  executions: async (runId: RunId) => unwrap(await api.GET("/api/runs/{run_id}/executions", { params: { path: { run_id: runId } } })),
  execution: async (runId: RunId, address: ApiExecutionAddress, payloads: ApiIncludePayloads = "truncated") =>
    unwrap(
      await api.GET("/api/runs/{run_id}/executions/detail", {
        params: { path: { run_id: runId }, query: addressQuery(address, payloads) },
      }),
    ),
  presentation: async (runId: RunId, locale: string, targets: readonly SchemaPresentationTarget[]): Promise<SchemaPresentationResponse> => {
    return unwrap(await api.POST("/api/runs/{run_id}/presentation", {
      params: { path: { run_id: runId } },
      body: { locale, targets: [...targets] },
    }))
  },
  events: async (runId: RunId, afterSeq = 0) => everyPage(async (cursor) =>
    unwrap(await api.GET("/api/runs/{run_id}/events/log", {
      params: { path: { run_id: runId }, query: { after_seq: cursor === null ? afterSeq : Number(cursor), limit: MAX_PAGE } },
    }))),
  start: async (request: ApiRunStartRequest) => unwrap(await api.POST("/api/runs", { body: request })),
  resume: async (runId: RunId, request: ApiResumeRequest) =>
    unwrap(await api.POST("/api/runs/{run_id}/resume", { params: { path: { run_id: runId } }, body: request })),
  fork: async (runId: RunId, request: ApiForkRequest) =>
    unwrap(await api.POST("/api/runs/{run_id}/fork", { params: { path: { run_id: runId } }, body: request })),
  cancel: async (runId: RunId, reason: string) =>
    unwrap(await api.POST("/api/runs/{run_id}/cancel", { params: { path: { run_id: runId } }, body: { reason } })),
}

const datasets = {
  list: async () => everyPage(async (cursor) => unwrap(await api.GET("/api/datasets", { params: { query: { cursor, limit: MAX_PAGE } } }))),
  detail: async (datasetId: string) =>
    unwrap(await api.GET("/api/datasets/{dataset_id}", { params: { path: { dataset_id: datasetId } } })),
  cases: async (datasetId: string) => everyPage(async (cursor) =>
    unwrap(await api.GET("/api/datasets/{dataset_id}/cases", { params: { path: { dataset_id: datasetId }, query: { cursor, limit: MAX_PAGE } } }))),
  caseDetail: async (datasetId: string, caseName: string) =>
    unwrap(await api.GET("/api/datasets/{dataset_id}/cases/{case_name}", {
      params: { path: { dataset_id: datasetId, case_name: caseName } },
    })),
  caseNames: async (datasetId: string, search: string | null, split: string | null) => everyPage(async (cursor) =>
    unwrap(await api.GET("/api/datasets/{dataset_id}/case-names", {
      params: { path: { dataset_id: datasetId }, query: { search, split, cursor, limit: MAX_PAGE } },
    }))),
  caseFromRun: async (datasetId: string, runId: RunId) =>
    unwrap(await api.POST("/api/datasets/{dataset_id}/cases/from-run", {
      params: { path: { dataset_id: datasetId } },
      body: { run_id: runId },
    })),
  draft: async (flowId: FlowId) =>
    unwrap(await api.POST("/api/datasets/draft", { body: { flow_id: flowId } })),
  create: async (request: ApiDatasetCreateRequest) =>
    unwrap(await api.POST("/api/datasets", { body: request })),
  csvTemplate: async (flowId: FlowId) =>
    unwrap(await api.GET("/api/datasets/import-csv/template", { params: { query: { flow_id: flowId } } })),
  previewCsv: async (flowId: FlowId, datasetId: string, file: File) =>
    unwrap(await api.POST("/api/datasets/import-csv/preview", {
      body: { dataset_id: datasetId, flow_id: flowId, file: file.name },
      bodySerializer: () => csvBody(flowId, datasetId, file),
    })),
  importCsv: async (flowId: FlowId, datasetId: string, file: File) =>
    unwrap(await api.POST("/api/datasets/import-csv", {
      body: { dataset_id: datasetId, flow_id: flowId, file: file.name },
      bodySerializer: () => csvBody(flowId, datasetId, file),
    })),
  attachMedia: async (attach: CaseMediaAttach) =>
    unwrap(await api.POST("/api/datasets/{dataset_id}/cases/{case_name}/media", {
      params: { path: { dataset_id: attach.datasetId, case_name: attach.caseName } },
      body: { location: attach.location, file_hash: attach.fileHash, file: attach.file.name },
      bodySerializer: () => mediaBody(attach),
    })),
}

const chat = {
  status: async () => unwrap(await api.GET("/api/chat/status")),
  models: async (backend: ApiChatBackendKind) =>
    unwrap(await api.GET("/api/chat/models", { params: { query: { backend } } })),
  backend: async () => unwrap(await api.GET("/api/chat/backend")),
  selectBackend: async (body: ApiChatBackendWrite) => unwrap(await api.PUT("/api/chat/backend", { body })),
  sessions: async () => unwrap(await api.GET("/api/chat/sessions")).items,
  session: async (sessionId: ChatSessionId) =>
    unwrap(await api.GET("/api/chat/sessions/{session_id}", { params: { path: { session_id: sessionId } } })),
  create: async (body: ApiChatSessionCreate) => unwrap(await api.POST("/api/chat/sessions", { body })),
  settings: async (sessionId: ChatSessionId, body: ApiChatSessionSettings) =>
    unwrap(await api.PATCH("/api/chat/sessions/{session_id}", { params: { path: { session_id: sessionId } }, body })),
  drop: async (sessionId: ChatSessionId) =>
    unwrap(await api.DELETE("/api/chat/sessions/{session_id}", { params: { path: { session_id: sessionId } } })),
  send: async (sessionId: ChatSessionId, body: ApiChatMessageRequest) =>
    unwrap(await api.POST("/api/chat/sessions/{session_id}/messages", { params: { path: { session_id: sessionId } }, body })),
  approve: async (sessionId: ChatSessionId, approvalId: string, body: ApiChatApprovalReply) =>
    unwrap(
      await api.POST("/api/chat/sessions/{session_id}/approvals/{approval_id}", {
        params: { path: { session_id: sessionId, approval_id: approvalId } },
        body,
      }),
    ),
  interrupt: async (sessionId: ChatSessionId) =>
    unwrap(await api.POST("/api/chat/sessions/{session_id}/interrupt", { params: { path: { session_id: sessionId } } })),
  transcript: async (sessionId: ChatSessionId, query: { readonly before_seq?: number; readonly limit?: number }) =>
    unwrap(await api.GET("/api/chat/sessions/{session_id}/transcript", { params: { path: { session_id: sessionId }, query } })),
}

const SECRET_SCOPE: SettingScope = "project"

const writeSetting = async (scope: SettingScope, key: SettingKey, body: ApiSettingWrite) =>
  unwrap(await api.PUT("/api/settings/{scope}/{key}", { params: { path: { scope, key } }, body }))

const clearSetting = async (scope: SettingScope, key: SettingKey) =>
  unwrap(await api.DELETE("/api/settings/{scope}/{key}", { params: { path: { scope, key } } }))

const settings = {
  providers: async () => unwrap(await api.GET("/api/settings/providers")),
  secrets: async () => unwrap(await api.GET("/api/settings/secrets")),
  list: async (scope: SettingScope) => unwrap(await api.GET("/api/settings/{scope}", { params: { path: { scope } } })),
  read: async (scope: SettingScope, key: SettingKey) =>
    unwrap(await api.GET("/api/settings/{scope}/{key}", { params: { path: { scope, key } } })),
  write: writeSetting,
  clear: clearSetting,
  putSecret: async (key: SettingKey, secret: string) => writeSetting(SECRET_SCOPE, key, { kind: "secret", secret }),
  deleteSetting: async (key: SettingKey) => clearSetting(SECRET_SCOPE, key),
  budget: async () => unwrap(await api.GET("/api/project/research")),
  saveBudget: async (body: ApiResearchBudgetWrite) => unwrap(await api.PUT("/api/project/research", { body })),
}

const blob = {
  meta: async (blobId: BlobId) => unwrap(await api.GET("/api/blobs/{blob_id}/meta", { params: { path: { blob_id: blobId } } })),
  read: async (blobId: BlobId) =>
    unwrap(await api.GET("/api/blobs/{blob_id}", { params: { path: { blob_id: blobId } }, parseAs: "text" })),
  url: (blobId: BlobId): string => `${API_BASE}/blobs/${encodeURIComponent(blobId)}`,
}

export const runEventsUrl = (runId: RunId, afterSeq: number | null): string =>
  afterSeq === null
    ? `${API_BASE}/runs/${encodeURIComponent(runId)}/events`
    : `${API_BASE}/runs/${encodeURIComponent(runId)}/events?after_seq=${String(afterSeq)}`

export const chatEventsUrl = (sessionId: ChatSessionId, afterSeq: number | null): string =>
  afterSeq === null
    ? `${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}/events`
    : `${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}/events?after_seq=${String(afterSeq)}`

export const liveSources = { project, server, flow, run, datasets, research, authoring, chat, settings, blob }

export type LiveSources = typeof liveSources
