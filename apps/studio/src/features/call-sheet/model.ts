import type { ApiExecutionDetail, ApiPromptDetail } from "@/domain"
import type { UpstreamRef } from "@/features/trace"

export const CALL_SHEET_TABS = ["model", "input", "prompt", "output", "checks"] as const

export type CallSheetTab = (typeof CALL_SHEET_TABS)[number]

export type BlobText = { readonly blobId: string; readonly text: string }

export type DisplayedSchema = {
  readonly schema: unknown
  readonly source: ApiExecutionDetail["schema_source"]
}

export type CallDetail = {
  readonly execution: ApiExecutionDetail
  readonly inputSchema: DisplayedSchema
  readonly outputSchema: DisplayedSchema
  readonly prompt: ApiPromptDetail | null
  readonly rawResponse: string | null
  readonly upstream: readonly UpstreamRef[]
  readonly blobs: readonly BlobText[]
}
