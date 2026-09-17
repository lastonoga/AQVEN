import type { AgentCell, AgentTitle, CallColumn, CallStatus } from "@/domain"
import { joinSpans, MODEL_FAMILY, type CellBlock, type Span, type Tone } from "@/components/studio"
import { joinMeta, PAIR_SEPARATOR, SEPARATOR, tokensPair, usd, duration } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { inlineBlock } from "./blocks"
import type { TraceContext } from "./context"

type TitleKind = AgentTitle["kind"]
type TitleOf<K extends TitleKind> = Extract<AgentTitle, { kind: K }>
type TitleHandler<K extends TitleKind> = (title: TitleOf<K>, ctx: TraceContext) => CellBlock<"heading">
type TitleHandlers = { readonly [K in TitleKind]: TitleHandler<K> }
type PanelTitle = TitleOf<"panel">

const COST_TONE: Partial<Readonly<Record<CallStatus, Tone>>> = {
  degraded: "warning",
  cached: "neutral",
  idle: "neutral",
}

const titleHeading = (title: string, dots: readonly Tone[]): CellBlock<"heading"> => ({ kind: "heading", size: "tiny", title, dots })

const fixedPanelTitle = (title: PanelTitle, t: Translator): string =>
  title.fixNode === undefined
    ? t("trace.agent.judgesWithFix", { count: title.judges })
    : t("trace.agent.judgesWithFixNode", { count: title.judges, node: title.fixNode })

const panelTitle = (title: PanelTitle, t: Translator): string =>
  title.fix ? fixedPanelTitle(title, t) : t("trace.agent.judgesFixNotRun", { count: title.judges })

const TITLE_HEADING: TitleHandlers = {
  model: (title, ctx) =>
    titleHeading(ctx.mixedFamilies ? joinMeta([MODEL_FAMILY[title.family].label, title.model]) : title.model, [title.family]),
  deterministic: (_title, ctx) => titleHeading(ctx.t("trace.agent.noModel"), ["neutral"]),
  panel: (title, ctx) => titleHeading(panelTitle(title, ctx.t), title.families),
  text: (title) => titleHeading(title.text, ["neutral"]),
}

const headingOf = <K extends TitleKind>(title: TitleOf<K>, ctx: TraceContext): CellBlock<"heading"> => {
  const handle: TitleHandler<K> = TITLE_HEADING[title.kind]
  return handle(title, ctx)
}

const shownTitle = (agent: AgentCell, ctx: TraceContext): AgentTitle | undefined => (ctx.headed ? undefined : agent.title)

const fixCost = (fixUsd: number | null, t: Translator): string => (fixUsd === null ? t("common.none") : usd(fixUsd))

const breakdownLine = (agent: AgentCell, title: AgentTitle | undefined, t: Translator): readonly CellBlock[] => {
  const breakdown = agent.breakdown
  if (breakdown === undefined) return []
  const judges = breakdown.judgesUsd.map((value) => usd(value)).join(PAIR_SEPARATOR)
  const fixSkipped = breakdown.fixUsd === null && title?.kind === "panel" && !title.fix
  const line = fixSkipped ? t("trace.agent.judgeCosts", { judges }) : t("trace.agent.panelCosts", { judges, fix: fixCost(breakdown.fixUsd, t) })
  return [inlineBlock([line], "small", "neutral")]
}

const tokenPart = (agent: AgentCell, title: AgentTitle | undefined, t: Translator): string | undefined => {
  if (agent.tokens === "cassette") return t("trace.agent.fromCassette")
  if (agent.tokens !== undefined) return tokensPair(agent.tokens.input, agent.tokens.output)
  if (agent.calls !== undefined) return t("trace.agent.calls", { count: agent.calls })
  return title?.kind === "deterministic" ? t("trace.agent.noTokens") : undefined
}

const statePart = (agent: AgentCell, status: CallStatus | undefined, t: Translator): string | undefined => {
  if (agent.waitingMinutes !== undefined) return t("trace.agent.waiting", { minutes: agent.waitingMinutes })
  return status === "idle" ? t("trace.agent.notCalled") : undefined
}

const statParts = (agent: AgentCell, column: CallColumn, title: AgentTitle | undefined, t: Translator): readonly string[] =>
  [
    agent.durationS === undefined ? undefined : duration(agent.durationS),
    tokenPart(agent, title, t),
    statePart(agent, column.status, t),
  ].filter((part): part is string => part !== undefined)

const costSpans = (agent: AgentCell, status: CallStatus | undefined): readonly Span[] => {
  const tone = status === undefined ? undefined : COST_TONE[status]
  const cost: Span = tone === undefined ? { text: usd(agent.costUsd), strong: true } : { text: usd(agent.costUsd), strong: true, tone }
  if (agent.costFactor === undefined) return [cost]
  return [cost, { text: ` ×${String(agent.costFactor)}`, tone: "neutral" }]
}

const statLine = (agent: AgentCell, column: CallColumn, title: AgentTitle | undefined, t: Translator): CellBlock => {
  const parts = statParts(agent, column, title, t)
  if (title === undefined) return inlineBlock([joinMeta([usd(agent.costUsd), ...parts])], "body", "default")
  const rest = joinSpans(parts.map((text): Span => ({ text, tone: "neutral" })), "neutral")
  const separator: readonly Span[] = rest.length === 0 ? [] : [{ text: SEPARATOR, tone: "neutral" }]
  return inlineBlock([[...costSpans(agent, column.status), ...separator, ...rest]], "small", "default")
}

const configLine = (agent: AgentCell, title: AgentTitle | undefined, t: Translator): readonly CellBlock[] => {
  const config = agent.config
  if (config === undefined) return title?.kind === "deterministic" ? [inlineBlock([t("trace.agent.noAgent")], "caption", "neutral")] : []
  const line = joinMeta([
    t("trace.agent.config", { agent: config.agent }),
    config.temperature === undefined ? undefined : t("trace.agent.temperature", { value: config.temperature }),
    config.reasoning === undefined ? undefined : t("trace.agent.reasoning", { value: t(`domain.reasoning.${config.reasoning}`) }),
    config.extra,
  ])
  return [inlineBlock([line], "caption", "neutral")]
}

export const agentCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const agent = column.agent
  if (agent === undefined) return []
  const title = shownTitle(agent, ctx)
  const heading = title === undefined ? [] : [headingOf(title, ctx)]
  return [...heading, ...breakdownLine(agent, title, ctx.t), statLine(agent, column, title, ctx.t), ...configLine(agent, title, ctx.t)]
}

export const modelCells = (column: CallColumn): readonly CellBlock[] => {
  const agent = column.agent
  if (agent === undefined) return []
  return [inlineBlock([joinMeta([usd(agent.costUsd), agent.durationS === undefined ? undefined : duration(agent.durationS)])], "body", "default")]
}
