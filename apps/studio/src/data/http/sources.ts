import type {
  CallDetail,
  ChatThread,
  DataflowRun,
  NodeContract,
  NodeInspection,
  NodesOverview,
  ReviewDetail,
  ReviewQueueItem,
  RowTrace,
  RunSummary,
  SchemaGraph,
  SetupOverview,
  ShellData,
  TestDetail,
  TestsOverview,
  WorkflowTemplate,
} from "@/domain"
import type { StudioSources, WorkflowScope } from "../ports"
import { postJson, readJson, readJsonOrNull } from "./client"

export const scopePath = (scope: WorkflowScope, ...segments: readonly string[]): string =>
  ["", "workspaces", scope.workspaceId, "workflows", scope.workflowId, ...segments].map(encodeURIComponent).join("/")

export const httpSources: StudioSources = {
  workspace: {
    shell: (scope) => readJsonOrNull<ShellData>(scopePath(scope, "shell")),
  },
  schema: {
    graph: (scope) => readJson<SchemaGraph>(scopePath(scope, "schema")),
    inspect: (scope, nodeId) => readJsonOrNull<NodeInspection>(scopePath(scope, "schema", "nodes", nodeId)),
  },
  runs: {
    list: (scope) => readJson<readonly RunSummary[]>(scopePath(scope, "runs")),
    dataflow: (scope, runId) => readJsonOrNull<DataflowRun>(scopePath(scope, "runs", runId, "dataflow")),
    call: (scope, callId) => readJsonOrNull<CallDetail>(scopePath(scope, "calls", callId)),
  },
  nodes: {
    overview: (scope) => readJson<NodesOverview>(scopePath(scope, "nodes")),
    contract: (scope, nodeId) => readJsonOrNull<NodeContract>(scopePath(scope, "nodes", nodeId, "contract")),
  },
  tests: {
    overview: (scope) => readJson<TestsOverview>(scopePath(scope, "tests")),
    detail: (scope, testId) => readJsonOrNull<TestDetail>(scopePath(scope, "tests", testId)),
    trace: (scope, testId, rowId) => readJsonOrNull<RowTrace>(scopePath(scope, "tests", testId, "rows", rowId, "trace")),
  },
  review: {
    queue: (scope) => readJson<readonly ReviewQueueItem[]>(scopePath(scope, "reviews")),
    detail: (scope, reviewId) => readJsonOrNull<ReviewDetail>(scopePath(scope, "reviews", reviewId)),
    decide: (scope, command) =>
      postJson(scopePath(scope, "reviews", command.reviewId, "decision"), { decision: command.decision, note: command.note }),
  },
  chat: {
    thread: (scope) => readJson<ChatThread>(scopePath(scope, "chat", "thread")),
  },
  setup: {
    overview: () => readJson<SetupOverview>("/setup"),
    templates: () => readJson<readonly WorkflowTemplate[]>("/templates"),
  },
}
