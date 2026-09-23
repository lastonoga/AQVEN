declare const brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type FlowId = Brand<string, "FlowId">
export type NodeId = Brand<string, "NodeId">
export type RunId = Brand<string, "RunId">
export type TypeId = Brand<string, "TypeId">
export type BlobId = Brand<string, "BlobId">
export type ChatSessionId = Brand<string, "ChatSessionId">
export type AgentId = Brand<string, "AgentId">
export type InferenceId = Brand<string, "InferenceId">
export type ContentHash = Brand<string, "ContentHash">
export type FilePath = Brand<string, "FilePath">
export type SettingKey = Brand<string, "SettingKey">
export type IsoDateTime = Brand<string, "IsoDateTime">
export type ProjectRoot = Brand<string, "ProjectRoot">
export type ExperimentId = Brand<string, "ExperimentId">
export type SeriesId = Brand<string, "SeriesId">
export type VariantId = Brand<string, "VariantId">
export type ArmId = Brand<string, "ArmId">
export type CheckId = Brand<string, "CheckId">
export type DatasetId = Brand<string, "DatasetId">

export const assertNever = (value: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`)
}
