import type {
  AgentId,
  BlobId,
  ChatSessionId,
  CheckId,
  ContentHash,
  DatasetId,
  ExperimentId,
  FilePath,
  FlowId,
  InferenceId,
  IsoDateTime,
  NodeId,
  ProjectRoot,
  RunId,
  SeriesId,
  SettingKey,
  TypeId,
  VariantId,
} from "@/domain"
import { ulid } from "ulid"

export const flowId = (raw: string): FlowId => raw as FlowId
export const nodeId = (raw: string): NodeId => raw as NodeId
export const runId = (raw: string): RunId => raw as RunId
export const typeId = (raw: string): TypeId => raw as TypeId
export const blobId = (raw: string): BlobId => raw as BlobId
export const chatSessionId = (raw: string): ChatSessionId => raw as ChatSessionId
export const agentId = (raw: string): AgentId => raw as AgentId
export const inferenceId = (raw: string): InferenceId => raw as InferenceId
export const contentHash = (raw: string): ContentHash => raw as ContentHash
export const filePath = (raw: string): FilePath => raw as FilePath
export const settingKey = (raw: string): SettingKey => raw as SettingKey
export const isoDateTime = (raw: string): IsoDateTime => raw as IsoDateTime
export const projectRoot = (raw: string): ProjectRoot => raw as ProjectRoot
export const experimentId = (raw: string): ExperimentId => raw as ExperimentId
export const seriesId = (raw: string): SeriesId => raw as SeriesId
export const variantId = (raw: string): VariantId => raw as VariantId
export const checkId = (raw: string): CheckId => raw as CheckId
export const datasetId = (raw: string): DatasetId => raw as DatasetId

export const clientOpId = (): string => globalThis.crypto.randomUUID()

export const writeOpId = (): string => ulid()
