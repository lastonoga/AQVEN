import type { MapSummary, RowKey } from "@/domain"
import type { CellBlock } from "@/components/studio"
import { score, usd, duration } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { inlineBlock } from "./blocks"

type SummaryCells = (summary: MapSummary, t: Translator) => readonly CellBlock[]

const RANGE_SEPARATOR = " … "

export const SUMMARY_CELLS: Partial<Readonly<Record<RowKey, SummaryCells>>> = {
  call: (summary, t) => [inlineBlock([t("trace.summary.moreCalls", { count: summary.hiddenCalls }), t("trace.summary.expand")], "small", "default")],
  agent: (summary, t) => [
    inlineBlock(
      [[{ text: usd(summary.totalUsd), strong: true }, { text: ` ${t("trace.summary.total")}` }], t("trace.summary.median", { value: duration(summary.medianS) })],
      "small",
      "default",
    ),
  ],
  input: (summary, t) => [inlineBlock([t("trace.summary.oneType"), summary.typeName], "small", "neutral")],
  output: (summary, t) => [
    inlineBlock([t("trace.summary.spread"), `${score(summary.spread.min)}${RANGE_SEPARATOR}${score(summary.spread.max)}`], "small", "default"),
    inlineBlock([t("trace.summary.okCount", { ok: summary.ok.passed, total: summary.ok.total })], "small", "neutral"),
  ],
}

export const summaryCells = (summary: MapSummary, key: RowKey, t: Translator): readonly CellBlock[] => SUMMARY_CELLS[key]?.(summary, t) ?? []
