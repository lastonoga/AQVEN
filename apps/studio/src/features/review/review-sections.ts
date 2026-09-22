import type { ApiHumanWaitDetail, ApiValueRef } from "@/domain"
import type { PropertyRow } from "@/components/studio"
import { parseValueText } from "@/components/studio"
import type { Translator } from "@/i18n/translator"

export type ReviewEvidence = {
  readonly id: string
  readonly title: string
  readonly lines: readonly string[]
  readonly rows: readonly PropertyRow[]
  readonly value?: unknown
}

const JSON_INDENT = 2

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const scalarText = (value: unknown): string | null => {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return value === null ? "null" : null
}

const valueText = (value: unknown): string => scalarText(value) ?? JSON.stringify(value, null, JSON_INDENT)

const rowsOf = (value: unknown, fallbackKey: string): readonly PropertyRow[] => {
  if (!isRecord(value)) return [{ key: fallbackKey, value: valueText(value) }]
  return Object.entries(value).map(([key, entry]) => ({ key, value: valueText(entry) }))
}

const inlineValue = (ref: ApiValueRef | null): unknown => (ref === null || ref.kind !== "inline" ? null : ref.value)

const toolCalls = (value: unknown): readonly Readonly<Record<string, unknown>>[] => {
  if (!isRecord(value)) return []
  const calls = value["calls"]
  return Array.isArray(calls) ? calls.filter(isRecord) : []
}

const callColumn = (call: Readonly<Record<string, unknown>>, index: number, t: Translator<"review">): ReviewEvidence => {
  const name = scalarText(call["tool_name"]) ?? t("detail.toolCall")
  const id = scalarText(call["tool_call_id"]) ?? String(index)
  return { id, title: name, lines: [t("detail.callId", { id })], rows: rowsOf(call["args"], t("detail.arguments")), value: call["args"] }
}

const blobEvidence = (ref: ApiValueRef, t: Translator<"review">, blobText?: string): readonly ReviewEvidence[] => [
  { id: "blob", title: t("detail.suspendData"), lines: [t("detail.storedBlob", { blob: ref.kind === "blob" ? ref.blob_id : "" })], rows: [], ...(blobText === undefined ? {} : { value: parseValueText(blobText) }) },
]

const inputColumns = (value: unknown, t: Translator<"review">): readonly ReviewEvidence[] => {
  if (!isRecord(value)) return [{ id: "input", title: t("detail.suspendData"), lines: [], rows: rowsOf(value, t("detail.suspendData")), value }]
  return Object.entries(value).map(([key, entry]) => ({ id: key, title: key, lines: [], rows: rowsOf(entry, key), value: entry }))
}

export const waitEvidence = (detail: ApiHumanWaitDetail, t: Translator<"review">, blobText?: string): readonly ReviewEvidence[] => {
  const ref = detail.suspend_data
  if (ref === null) return []
  if (ref.kind === "blob") return blobEvidence(ref, t, blobText)
  const value = inlineValue(ref)
  const calls = toolCalls(value)
  if (calls.length > 0) return calls.map((call, index) => callColumn(call, index, t))
  return inputColumns(value, t)
}
