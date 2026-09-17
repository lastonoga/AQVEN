declare const brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type WorkspaceId = Brand<string, "WorkspaceId">
export type WorkflowId = Brand<string, "WorkflowId">
export type NodeId = Brand<string, "NodeId">
export type RunId = Brand<string, "RunId">
export type CallId = Brand<string, "CallId">
export type StageId = Brand<string, "StageId">
export type ColumnId = Brand<string, "ColumnId">
export type ColumnPath = Brand<string, "ColumnPath">
export type TestId = Brand<string, "TestId">
export type DatasetId = Brand<string, "DatasetId">
export type RowId = Brand<string, "RowId">
export type ReviewId = Brand<string, "ReviewId">
export type RevisionId = Brand<string, "RevisionId">
export type RegistryEntryId = Brand<string, "RegistryEntryId">
export type IsoDateTime = Brand<string, "IsoDateTime">
export type ProjectRoot = Brand<string, "ProjectRoot">
export type TemplateId = Brand<string, "TemplateId">

export const assertNever = (value: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`)
}
