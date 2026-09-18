import type { CellBlock, Span } from "@/components/studio"
import { joinMeta, tokensPair, usd } from "@/lib/format"
import { inlineBlock } from "./blocks"
import type { TraceContext } from "./context"
import type { CallColumn } from "./model"

const NO_BLOCKS: readonly CellBlock[] = []

export const latencyText = (latencyMs: number | null): string | null =>
  latencyMs === null ? null : `${String(latencyMs)} ms`

export const agentCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const { agent, inference, profile } = column.agent
  const lines = [
    agent === null ? undefined : ctx.t("trace.agent.agent", { value: agent }),
    inference === null ? undefined : ctx.t("trace.agent.inference", { value: inference }),
    profile === null ? undefined : ctx.t("trace.agent.profile", { value: profile }),
  ].filter((line): line is string => line !== undefined)
  if (lines.length === 0) return NO_BLOCKS
  return [inlineBlock(lines, "small", "default")]
}

export const modelCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const { model, costUsd, latencyMs, tokensIn, tokensOut } = column.agent
  const head: readonly Span[] = [model === null ? { text: ctx.t("trace.agent.noModel"), tone: "neutral" } : { text: model, mono: true }]
  const meta = joinMeta([usd(costUsd), latencyText(latencyMs), tokensIn + tokensOut === 0 ? null : tokensPair(tokensIn, tokensOut)])
  return [inlineBlock([head], "small", "default"), inlineBlock([meta], "tiny", "neutral")]
}
