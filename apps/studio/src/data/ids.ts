import type {
  CallId,
  ColumnId,
  ColumnPath,
  DatasetId,
  IsoDateTime,
  ProjectRoot,
  NodeId,
  RegistryEntryId,
  ReviewId,
  RevisionId,
  RowId,
  RunId,
  StageId,
  TemplateId,
  TestId,
  WorkflowId,
  WorkspaceId,
} from "@/domain"

export const workspaceId = (raw: string): WorkspaceId => raw as WorkspaceId
export const workflowId = (raw: string): WorkflowId => raw as WorkflowId
export const nodeId = (raw: string): NodeId => raw as NodeId
export const runId = (raw: string): RunId => raw as RunId
export const callId = (raw: string): CallId => raw as CallId
export const stageId = (raw: string): StageId => raw as StageId
export const columnId = (raw: string): ColumnId => raw as ColumnId
export const columnPath = (raw: string): ColumnPath => raw as ColumnPath
export const testId = (raw: string): TestId => raw as TestId
export const datasetId = (raw: string): DatasetId => raw as DatasetId
export const rowId = (raw: string): RowId => raw as RowId
export const reviewId = (raw: string): ReviewId => raw as ReviewId
export const revisionId = (raw: string): RevisionId => raw as RevisionId
export const registryEntryId = (raw: string): RegistryEntryId => raw as RegistryEntryId
export const isoDateTime = (raw: string): IsoDateTime => raw as IsoDateTime
export const projectRoot = (raw: string): ProjectRoot => raw as ProjectRoot
export const templateId = (raw: string): TemplateId => raw as TemplateId
