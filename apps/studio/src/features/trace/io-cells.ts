import type { CallColumn, ClaimVerdict, InputCell, JudgeVerdict, NodeKind, OutputCell, OutputStatus, ProvenancedValue, TextLine } from "@/domain"
import { checkSpan, PROVENANCE, VERDICT_OUTCOME, type CellBlock, type Inline, type Span } from "@/components/studio"
import { joinMeta, minutesClock, score, SEPARATOR } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { GLYPH_REF_TONE, inlineBlock, LINK_TONE, linkBlock } from "./blocks"
import type { TraceContext } from "./context"

type InputKind = InputCell["kind"]
type InputOf<K extends InputKind> = Extract<InputCell, { kind: K }>
type InputHandler<K extends InputKind> = (input: InputOf<K>, ctx: TraceContext, shared: boolean) => readonly CellBlock[]
type InputHandlers = { readonly [K in InputKind]: InputHandler<K> }
type OutputKind = OutputCell["kind"]
type OutputOf<K extends OutputKind> = Extract<OutputCell, { kind: K }>
type OutputHandler<K extends OutputKind> = (output: OutputOf<K>, column: CallColumn, ctx: TraceContext) => readonly CellBlock[]
type OutputHandlers = { readonly [K in OutputKind]: OutputHandler<K> }
type RefsInput = InputOf<"refs">
type RefsLayout = "glyphs" | "chips"

const REF_ARROW = " ← "
const NON_MODEL_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(["tool", "fn", "human"])

const refText = (ref: ProvenancedValue, t: Translator): string => {
  if (ref.unchanged === true) return `${ref.label} ${t("trace.input.refUnchanged")}`
  if (ref.value === undefined) return ref.label
  return `${ref.label}${REF_ARROW}${ref.value}`
}

const hashText = (input: RefsInput, ctx: TraceContext): string | undefined =>
  input.hash === undefined ? undefined : ctx.t("trace.input.identicalAcrossBranches", { hash: input.hash, count: ctx.group.columns.length })

const frozenText = (input: RefsInput, ctx: TraceContext): string | undefined => (input.frozen === true ? ctx.t("trace.input.fromDataset") : undefined)

const noteLines = (notes: readonly (string | undefined)[]): readonly CellBlock[] => {
  const lines = notes.filter((note): note is string => note !== undefined)
  return lines.length === 0 ? [] : [inlineBlock(lines, "small", "neutral")]
}

const trailingText = (text: string): Pick<CellBlock<"refs">, "text"> => (text.length === 0 ? {} : { text })

const expandsInput = (ctx: TraceContext, shared: boolean): boolean => shared && ctx.variant === "trace"

const refsLink = (ctx: TraceContext, shared: boolean): Pick<CellBlock<"refs">, "link"> =>
  expandsInput(ctx, shared) ? { link: ctx.t("trace.input.expand") } : {}

const refsExpandLink = (ctx: TraceContext, shared: boolean): readonly CellBlock[] =>
  expandsInput(ctx, shared) ? [linkBlock(ctx.t("trace.input.expand"), LINK_TONE.trace)] : []

const REFS_LAYOUT: Readonly<Record<RefsLayout, (input: RefsInput, ctx: TraceContext, shared: boolean) => readonly CellBlock[]>> = {
  glyphs: (input, ctx, shared) => [
    inlineBlock(
      input.refs.map((ref): Span => ({ glyph: PROVENANCE[ref.provenance].glyph, text: refText(ref, ctx.t) })),
      "small",
      GLYPH_REF_TONE[ctx.variant],
    ),
    ...noteLines([input.note, hashText(input, ctx), frozenText(input, ctx)]),
    ...refsExpandLink(ctx, shared),
  ],
  chips: (input, ctx, shared) => [
    {
      kind: "refs",
      items: input.refs.map((ref) => ({ provenance: ref.provenance, text: refText(ref, ctx.t) })),
      ...trailingText(joinMeta([hashText(input, ctx), frozenText(input, ctx)])),
      ...refsLink(ctx, shared),
    },
    ...noteLines([input.note]),
  ],
}

const refsLayout = (ctx: TraceContext): RefsLayout => (ctx.group.kind === "loop" ? "glyphs" : "chips")

const INPUT_CELLS: InputHandlers = {
  refs: (input, ctx, shared) => REFS_LAYOUT[refsLayout(ctx)](input, ctx, shared),
  text: (input) => [{ kind: "text", lines: input.lines, variant: "context", clamp: true }],
  parts: (input) => [{ kind: "parts", parts: input.parts }],
}

export const inputBlocks = <K extends InputKind>(input: InputOf<K>, ctx: TraceContext, shared: boolean): readonly CellBlock[] => {
  const handle: InputHandler<K> = INPUT_CELLS[input.kind]
  return handle(input, ctx, shared)
}

export const inputCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] =>
  column.input === undefined ? [] : inputBlocks(column.input, ctx, false)

const failedTraceLink = (column: CallColumn, ctx: TraceContext, text: (t: Translator) => string): readonly CellBlock[] =>
  ctx.variant === "trace" && column.status === "failed" ? [linkBlock(text(ctx.t), LINK_TONE.trace)] : []

export const promptBlocks = (lines: readonly TextLine[]): readonly CellBlock[] => [
  { kind: "text", lines, variant: "context", muted: true, clamp: true },
]

const isUncalledNonModel = (column: CallColumn): boolean =>
  column.kind !== undefined && NON_MODEL_KINDS.has(column.kind) && column.status !== "idle"

export const promptCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  if (column.prompt !== undefined) return [...promptBlocks(column.prompt), ...failedTraceLink(column, ctx, (t) => t("trace.prompt.open"))]
  if (isUncalledNonModel(column)) return [inlineBlock([ctx.t("trace.prompt.none")], "caption", "neutral")]
  return []
}

const VERDICT_TEXT: Readonly<Record<JudgeVerdict | ClaimVerdict, (t: Translator) => string>> = {
  approved: () => "approved",
  needs_human: () => "needs_human",
  rejected: () => "rejected",
  matched: (t) => t("domain.claimVerdict.matched"),
  invented: (t) => t("domain.claimVerdict.invented"),
}

const OUTPUT_STATUS: Readonly<Record<OutputStatus, (output: OutputOf<"status">, t: Translator) => readonly string[]>> = {
  skipped: (output, t) => [t("trace.output.skipped", { case: output.case ?? "" })],
  awaiting: (output, t) => [
    t("trace.output.awaiting"),
    ...(output.deadlineMinutes === undefined ? [] : [t("trace.output.deadline", { time: minutesClock(output.deadlineMinutes) })]),
  ],
  aborted: (_output, t) => [t("trace.output.aborted")],
}

const truncatedLink = (output: OutputOf<"lines">, ctx: TraceContext): readonly CellBlock[] =>
  ctx.variant === "run" && output.truncated === true ? [linkBlock(ctx.t("trace.output.expand"), LINK_TONE.run)] : []

const verdictLine = (output: OutputOf<"verdict">, t: Translator): Inline => {
  const verdict = checkSpan(VERDICT_OUTCOME[output.verdict] === "ok", VERDICT_TEXT[output.verdict](t))
  if (output.remark === undefined) return [verdict]
  return [verdict, { text: `${SEPARATOR}${output.remark}` }]
}

const OUTPUT_CELLS: OutputHandlers = {
  lines: (output, column, ctx) => [
    { kind: "text", lines: output.lines, variant: "output", clamp: true },
    ...truncatedLink(output, ctx),
    ...failedTraceLink(column, ctx, (t) => t("trace.output.open")),
  ],
  parts: (output) => [{ kind: "parts", parts: output.parts }],
  verdict: (output, _column, ctx) => [
    inlineBlock([verdictLine(output, ctx.t)], "body", "default"),
    ...(output.score === undefined ? [] : [inlineBlock([{ text: score(output.score), strong: true }], "tiny", "default")]),
  ],
  status: (output, _column, ctx) => [inlineBlock(OUTPUT_STATUS[output.status](output, ctx.t), "body", "default")],
}

const outputBlocks = <K extends OutputKind>(output: OutputOf<K>, column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  const handle: OutputHandler<K> = OUTPUT_CELLS[output.kind]
  return handle(output, column, ctx)
}

export const outputCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] =>
  column.output === undefined ? [] : outputBlocks(column.output, column, ctx)
