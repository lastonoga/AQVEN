import type { AttemptOutcome, CellVerdict, SeriesSplit, SeriesStatus, StabilityClass, VariantRole, VerdictState } from "@/domain"
import type { Tone } from "@/components/studio"
import type { RowRole } from "./variant-table"

export const SERIES_STATUS_TONE: Readonly<Record<SeriesStatus, Tone>> = {
  running: "primary",
  awaiting_approval: "warning",
  waiting_human: "warning",
  done: "success",
  cancelled: "neutral",
  failed: "destructive",
}

export const VERDICT_TONE: Readonly<Record<VerdictState, Tone>> = {
  confirmed: "success",
  refuted: "destructive",
  inconclusive: "warning",
  invalid: "neutral",
  signal: "llm",
}

export const CELL_VERDICT_TONE: Readonly<Record<CellVerdict, Tone>> = {
  pass: "success",
  fail: "destructive",
  unclear: "warning",
  reference: "primary",
  none: "neutral",
}

export const OUTCOME_TONE: Readonly<Record<AttemptOutcome, Tone>> = {
  passed: "success",
  failed: "destructive",
  error: "warning",
  waiting: "llm",
  running: "primary",
}

export const STABILITY_TONE: Readonly<Record<StabilityClass, Tone>> = {
  always: "success",
  flaky: "warning",
  never: "destructive",
}

export const ROLE_TONE: Readonly<Record<VariantRole, Tone>> = {
  baseline: "primary",
  candidate: "llm",
  other: "neutral",
}

export const ROW_ROLE_TONE: Readonly<Record<RowRole, Tone>> = {
  ...ROLE_TONE,
  tested: "tool",
}

export const SPLIT_TONE: Readonly<Record<SeriesSplit, Tone>> = {
  dev: "primary",
  holdout: "tool",
}
