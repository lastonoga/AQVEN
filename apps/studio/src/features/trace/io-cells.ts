import type { CellBlock } from "@/components/studio"
import { joinMeta } from "@/lib/format"
import { plainLines } from "@/lib/text"
import { PresentationValue } from "@/features/runs"
import { inlineBlock, textBlock } from "./blocks"
import type { TraceContext } from "./context"
import type { CallColumn, InputCell, MediaRef, PromptCell, RecoveryCell, ValueCell, ValueIdentity } from "./model"
import { byteSize, isBinaryMedia } from "./values"

type InputKind = InputCell["kind"]
type InputOf<K extends InputKind> = Extract<InputCell, { kind: K }>
type InputHandler<K extends InputKind> = (input: InputOf<K>, ctx: TraceContext) => readonly CellBlock[]
type InputHandlers = { readonly [K in InputKind]: InputHandler<K> }

const HASH_HEAD = 14
const NO_BLOCKS: readonly CellBlock[] = []

export const shortHash = (hash: string): string => hash.slice(0, HASH_HEAD)

export const identityText = (identity: ValueIdentity, ctx: TraceContext): string =>
  joinMeta([
    ctx.t(`trace.ref.${identity.kind}`),
    identity.mediaType,
    identity.bytes === null ? null : byteSize(identity.bytes),
    identity.hash === null ? null : shortHash(identity.hash),
  ])

export const mediaText = (media: MediaRef, ctx: TraceContext): string =>
  joinMeta([ctx.t("trace.ref.media", { slot: media.slot }), media.mediaType, byteSize(media.bytes), shortHash(media.blobId)])

const identityBlock = (cell: ValueCell, ctx: TraceContext): CellBlock =>
  inlineBlock([identityText(cell.identity, ctx)], "tiny", "neutral")

const mediaBlocks = (cell: ValueCell, ctx: TraceContext): readonly CellBlock[] =>
  cell.media.length === 0 ? NO_BLOCKS : [inlineBlock(cell.media.map((media) => mediaText(media, ctx)), "tiny", "tool")]

export const valueBlocks = (cell: ValueCell, ctx: TraceContext): readonly CellBlock[] => {
  const mediaOnly = isBinaryMedia(cell.ref)
  return [
    { kind: "value", value: mediaOnly ? cell.ref : cell.value, media: cell.media, mediaOnly },
    ...(cell.incomplete ? [inlineBlock([ctx.t("common.previewOnly")], "tiny", "warning")] : []),
    ...mediaBlocks(cell, ctx),
    ...(cell.identity.kind === "blob" ? [identityBlock(cell, ctx)] : []),
  ]
}

const INPUT_CELLS: InputHandlers = {
  recorded: (input, ctx) => valueBlocks(input.value, ctx),
  upstream: (input, ctx) => [
    {
      kind: "refs",
      items: input.refs.map((ref) => ({ provenance: "generated" as const, text: ref.nodeId })),
      text: ctx.t("trace.input.fromUpstream"),
    },
  ],
}

const inputBlocks = <K extends InputKind>(input: InputOf<K>, ctx: TraceContext): readonly CellBlock[] => {
  const handle: InputHandler<K> = INPUT_CELLS[input.kind]
  return handle(input, ctx)
}

export const inputCells = (input: InputCell | null, ctx: TraceContext): readonly CellBlock[] =>
  input === null ? NO_BLOCKS : inputBlocks(input, ctx)

export const outputCells = (cell: ValueCell | null, ctx: TraceContext): readonly CellBlock[] =>
  cell === null ? NO_BLOCKS : valueBlocks(cell, ctx)

export const inferenceInputCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  if (column.kind !== "llm" || column.input?.kind !== "recorded") return inputCells(column.input, ctx)
  const cell = column.input.value
  return [{ kind: "node", node: createElement(PresentationValue, { address: column.address, side: "input", value: cell.value, valueRef: cell.ref, media: cell.media, mediaOnly: isBinaryMedia(cell.ref), compact: true }) },
    ...valueBlocks(cell, ctx).slice(1)]
}

const recoveryCells = (recovery: RecoveryCell, ctx: TraceContext): readonly CellBlock[] => [
  ...outputCells(recovery.value, ctx),
  inlineBlock([ctx.t(`trace.recovery.caption.${recovery.decision}`, { policy: recovery.policy })], "caption", "warning"),
]

export const inferenceOutputCells = (column: CallColumn, ctx: TraceContext): readonly CellBlock[] => {
  if (column.recovery !== null) return recoveryCells(column.recovery, ctx)
  if (column.kind !== "llm" || column.output === null) return outputCells(column.output, ctx)
  const cell = column.output
  return [{ kind: "node", node: createElement(PresentationValue, { address: column.address, side: "output", value: cell.value, valueRef: cell.ref, media: cell.media, mediaOnly: isBinaryMedia(cell.ref), compact: true }) },
    ...valueBlocks(cell, ctx).slice(1)]
}

export const promptCells = (prompt: PromptCell | null, ctx: TraceContext): readonly CellBlock[] => {
  if (prompt === null) return NO_BLOCKS
  const meta = joinMeta([
    prompt.inference === null ? null : ctx.t("trace.prompt.inference", { value: prompt.inference }),
    prompt.level === null ? null : ctx.t("trace.prompt.level", { level: prompt.level }),
  ])
  const lines = prompt.kind === "captured" ? prompt.lines : plainLines(ctx.t("trace.prompt.notCaptured"))
  return [textBlock(lines, "context"), ...(meta.length === 0 ? [] : [inlineBlock([meta], "tiny", "neutral")])]
}
import { createElement } from "react"
