import type { Dataset, DatasetRow, DatasetSource, RowResult, TestRunSummary } from "@/domain"
import { count, groupedCount, plainUsd, score, seconds } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type ValueAlign = "start" | "end"
export type ValueTrack = { readonly track: string; readonly align: ValueAlign }
export type Quote = (text: string) => string

type SourceKind = DatasetSource["kind"]
type SourceOf<K extends SourceKind> = Extract<DatasetSource, { kind: K }>
type SourceHandler<K extends SourceKind> = (source: SourceOf<K>, t: Translator<"testDetail">) => readonly string[]
type SourceHandlers = { readonly [K in SourceKind]: SourceHandler<K> }

export type ResultColumn = "iterations" | "calls" | "cost" | "time" | "delta"

const NUMERIC_TRACK: ValueTrack = { track: "minmax(0,0.6fr)", align: "end" }
const TEXT_TRACK: ValueTrack = { track: "minmax(0,1fr)", align: "start" }
const QUOTED_PREFIX = "expected."
const LIST_SEPARATOR = ", "

const SOURCE_PARTS: SourceHandlers = {
  spreadsheet: (source, t) => [t("dataset.source.spreadsheet"), ...(source.agentExtended ? [t("dataset.source.agentExtended")] : [])],
  agent: (_source, t) => [t("dataset.source.agent")],
  tool: (source, t) => [t("dataset.source.tool", { adapter: source.adapter })],
  manual: (_source, t) => [t("dataset.source.manual")],
}

const sourceParts = <K extends SourceKind>(source: SourceOf<K>, t: Translator<"testDetail">): readonly string[] => {
  const handle: SourceHandler<K> = SOURCE_PARTS[source.kind]
  return handle(source, t)
}

export const datasetMeta = (dataset: Dataset, t: Translator<"testDetail">): string =>
  t("dataset.meta", {
    rows: dataset.rowCount,
    assertions: dataset.assertionCount,
    sources: sourceParts(dataset.source, t).join(LIST_SEPARATOR),
  })

export const failureCount = (summary: TestRunSummary): number => summary.rows - summary.passed

export const valueTrack = (rows: readonly DatasetRow[], key: string): ValueTrack =>
  rows.length > 0 && rows.every((row) => typeof row.values[key] === "number") ? NUMERIC_TRACK : TEXT_TRACK

export const datasetValue = (key: string, value: string | number | undefined, quote: Quote): string => {
  if (value === undefined) return ""
  if (typeof value === "number") return groupedCount(value)
  return key.startsWith(QUOTED_PREFIX) ? quote(value) : value
}

export const RESULT_VALUE: Readonly<Record<ResultColumn, (result: RowResult) => string>> = {
  iterations: (result) => count(result.iterations),
  calls: (result) => count(result.calls),
  cost: (result) => plainUsd(result.costUsd),
  time: (result) => seconds(result.durationS),
  delta: (result) => score(result.delta),
}
