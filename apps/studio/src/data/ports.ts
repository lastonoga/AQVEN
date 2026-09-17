import type {
  CallDetail,
  CallId,
  ChatThread,
  DataflowRun,
  DecisionCommand,
  NodeContract,
  NodeId,
  NodeInspection,
  NodesOverview,
  ReviewDetail,
  ReviewId,
  ReviewQueueItem,
  RowId,
  RowTrace,
  RunId,
  RunSummary,
  SchemaGraph,
  SetupOverview,
  ShellData,
  TestDetail,
  TestId,
  TestsOverview,
  WorkflowTemplate,
  WorkflowId,
  WorkspaceId,
} from "@/domain"

export type WorkflowScope = { readonly workspaceId: WorkspaceId; readonly workflowId: WorkflowId }

export interface WorkspaceSource {
  shell(scope: WorkflowScope): Promise<ShellData | null>
}

export interface SchemaSource {
  graph(scope: WorkflowScope): Promise<SchemaGraph>
  inspect(scope: WorkflowScope, nodeId: NodeId): Promise<NodeInspection | null>
}

export interface RunSource {
  list(scope: WorkflowScope): Promise<readonly RunSummary[]>
  dataflow(scope: WorkflowScope, runId: RunId): Promise<DataflowRun | null>
  call(scope: WorkflowScope, callId: CallId): Promise<CallDetail | null>
}

export interface NodeSource {
  overview(scope: WorkflowScope): Promise<NodesOverview>
  contract(scope: WorkflowScope, nodeId: NodeId): Promise<NodeContract | null>
}

export interface TestSource {
  overview(scope: WorkflowScope): Promise<TestsOverview>
  detail(scope: WorkflowScope, testId: TestId): Promise<TestDetail | null>
  trace(scope: WorkflowScope, testId: TestId, rowId: RowId): Promise<RowTrace | null>
}

export interface ReviewSource {
  queue(scope: WorkflowScope): Promise<readonly ReviewQueueItem[]>
  detail(scope: WorkflowScope, reviewId: ReviewId): Promise<ReviewDetail | null>
  decide(scope: WorkflowScope, command: DecisionCommand): Promise<void>
}

export interface ChatSource {
  thread(scope: WorkflowScope): Promise<ChatThread>
}

export interface SetupSource {
  overview(): Promise<SetupOverview>
  templates(): Promise<readonly WorkflowTemplate[]>
}

export type StudioSources = {
  readonly workspace: WorkspaceSource
  readonly schema: SchemaSource
  readonly runs: RunSource
  readonly nodes: NodeSource
  readonly tests: TestSource
  readonly review: ReviewSource
  readonly chat: ChatSource
  readonly setup: SetupSource
}
