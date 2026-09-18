import type { ReactNode } from "react"
import type { ApiExecutionAddress, ApiExecutionDetail, ApiHumanWaitDetail, ApiValueRef } from "@/domain"
import { PresentationValue, type PresentationSide } from "@/features/runs"
import { StructuredValue, Surface } from "@/components/studio"
import type { PropertyRow, SectionSpec } from "@/components/studio"
import { blobTextValue, byteSize, isBinaryMedia, valueCell, type UpstreamRef, type ValueCell } from "@/features/trace"
import type { OutputMedia } from "@/components/studio/media-output"
import { joinMeta } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import type { BlobText, CallDetail, CallSheetTab } from "./model"
import { ScrollBox } from "./scroll-box"
import { CheckCards, PromptMessages, SchemaCard } from "./detail-cards"

export type SheetContext = { readonly t: Translator; readonly none: string; readonly raw: boolean }

export type CallSheetSectionsPresenter = (detail: CallDetail, ctx: SheetContext) => readonly SectionSpec[]

const row = (key: string, value: string): PropertyRow => ({ key, value })

const properties = (id: string, title: ReactNode, rows: readonly PropertyRow[]): readonly SectionSpec[] =>
  rows.length === 0 ? [] : [{ id, title, body: { kind: "properties", rows } }]

const raw = (id: string, title: ReactNode, text: string, hint?: string): readonly SectionSpec[] => {
  if (text.length === 0) return hint === undefined ? [] : [{ id, title, hint, body: { kind: "text", lines: [] } }]
  return [{ id, title, body: { kind: "node", node: <ScrollBox text={text} /> } }]
}

const structured = (id: string, title: ReactNode, value: unknown, hint?: string, media: readonly OutputMedia[] = [], mediaOnly = false): readonly SectionSpec[] =>
  value === null || value === undefined ? hint === undefined ? [] : [{ id, title, hint, body: { kind: "text", lines: [] } }]
    : [{ id, title, hint, body: { kind: "value", value, media, mediaOnly } }]

const schemaSection = (id: string, title: string, schema: unknown, source: ApiExecutionDetail["schema_source"], ctx: SheetContext, showAllowedValues = false): SectionSpec => ({
  id,
  title,
  body: { kind: "node", node: <SchemaCard schema={schema} source={source} raw={ctx.raw} showAllowedValues={showAllowedValues} /> },
})

const identityRows = (cell: ValueCell, ctx: SheetContext): readonly PropertyRow[] => [
  row(ctx.t("callSheet.ref.kind"), ctx.t(`callSheet.ref.${cell.identity.kind}`)),
  ...(cell.identity.hash === null ? [] : [row(ctx.t("callSheet.ref.hash"), cell.identity.hash)]),
  ...(cell.identity.mediaType === null ? [] : [row(ctx.t("callSheet.ref.mediaType"), cell.identity.mediaType)]),
  ...(cell.identity.bytes === null ? [] : [row(ctx.t("callSheet.ref.size"), byteSize(cell.identity.bytes))]),
  ...cell.media.map((media) =>
    row(ctx.t("callSheet.ref.mediaSlot", { slot: media.slot }), joinMeta([media.mediaType, byteSize(media.bytes), media.blobId])),
  ),
]

const refSections = (id: string, title: string, ref: ApiValueRef | null, ctx: SheetContext, blobs: readonly BlobText[] = [], target?: { readonly address: ApiExecutionAddress; readonly side: PresentationSide }, emptyHint?: string): readonly SectionSpec[] => {
  const cell = valueCell(ref, ref?.kind === "blob" ? blobs.find((blob) => blob.blobId === ref.blob_id)?.text : undefined)
  if (cell === null) return [{ id, title, body: { kind: "node", node: <Surface variant="panel" padding="sm" className="text-xs text-muted-foreground" role="region" aria-label={title}>{emptyHint ?? ctx.t("callSheet.notRecorded")}</Surface> } }]
  const display = target === undefined
    ? <StructuredValue value={ctx.raw && isBinaryMedia(cell.ref) ? cell.ref : cell.value} media={cell.media} mediaOnly={!ctx.raw && isBinaryMedia(cell.ref)} />
    : <PresentationValue address={target.address} side={target.side} value={cell.value} valueRef={cell.ref} media={cell.media} mediaOnly={isBinaryMedia(cell.ref)} detail />
  return [
    { id: `${id}-value`, title, hint: cell.incomplete ? ctx.t("common.previewOnly") : undefined,
      body: { kind: "node", node: <Surface variant="panel" padding="sm" className="min-w-0" role="region" aria-label={title}>{display}</Surface> } },
    ...(ctx.raw ? properties(`${id}-ref`, ctx.t("callSheet.ref.section"), identityRows(cell, ctx)) : []),
  ]
}

const blobSections = (blobs: readonly BlobText[], execution: ApiExecutionDetail, ctx: SheetContext): readonly SectionSpec[] =>
  blobs.flatMap((blob) => {
    const ref = [execution.input_ref, execution.output_ref].find((item) => item?.kind === "blob" && item.blob_id === blob.blobId)
    const value = ref?.kind === "blob" ? blobTextValue(blob.text, ref.media_type) : blob.text
    return structured(`blob-${blob.blobId}`, ctx.t("callSheet.blobSection", { blob: blob.blobId }), value)
  })

const upstreamSections = (refs: readonly UpstreamRef[], ctx: SheetContext): readonly SectionSpec[] =>
  refs.flatMap((ref) => {
    const cell = ref.cell
    if (cell === null) return []
    return [
      ...structured(`upstream-${ref.nodeId}`, ctx.t("callSheet.input.upstreamSection", { node: ref.nodeId }), cell.value),
      ...(ctx.raw ? properties(`upstream-${ref.nodeId}-ref`, ctx.t("callSheet.ref.sectionOf", { node: ref.nodeId }), identityRows(cell, ctx)) : []),
    ]
  })

const payloadValueSections = (side: PresentationSide, detail: CallDetail, ctx: SheetContext): readonly SectionSpec[] => {
  const { execution, blobs } = detail
  const ref = side === "input" ? execution.input_ref : execution.output_ref
  const title = ctx.t(side === "input" ? "callSheet.input.section" : "callSheet.output.section")
  return refSections(side, title, ref, ctx, blobs, execution.kind === "llm" ? { address: execution.address, side } : undefined,
    side === "input" ? ctx.t("callSheet.input.noneRecorded") : undefined)
}

const inputSections: CallSheetSectionsPresenter = (detail, ctx) => [
  ...payloadValueSections("input", detail, ctx),
  ...(detail.execution.input_ref === null ? upstreamSections(detail.upstream, ctx) : []),
  schemaSection("input-schema", ctx.t("callSheet.input.schemaSection"), detail.inputSchema.schema, detail.inputSchema.source, ctx),
]

const slotRows = (detail: NonNullable<CallDetail["prompt"]>): readonly PropertyRow[] =>
  detail.slots.map((slot) => ({ key: slot.name, value: slot.type_id }))

const templateSections = (prompt: NonNullable<CallDetail["prompt"]>, ctx: SheetContext): readonly SectionSpec[] => {
  const source = prompt.source?.text
  if (source === undefined || source.length === 0) return []
  return [{
    id: "prompt-template",
    title: ctx.t("callSheet.prompt.section"),
    body: { kind: "node", node: <Surface variant="panel" padding="sm">
      <details>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{ctx.t("callSheet.prompt.showTemplate")}</summary>
        <div className="mt-2"><ScrollBox text={source} /></div>
      </details>
    </Surface> },
  }]
}

const promptSections: CallSheetSectionsPresenter = ({ execution, prompt }, ctx) => {
  return [
    { id: "rendered-prompt", title: ctx.t("callSheet.prompt.renderedSection"), body: { kind: "node", node: <PromptMessages prompt={execution.prompt} raw={ctx.raw} /> } },
    ...(prompt === null ? [] : templateSections(prompt, ctx)),
    ...(prompt === null ? [] : [
      ...properties("prompt-meta", ctx.t("callSheet.prompt.fileSection"), [
        row(ctx.t("callSheet.prompt.inference"), prompt.inference_id),
        row(ctx.t("callSheet.prompt.level"), prompt.level === null ? ctx.none : String(prompt.level)),
        row(ctx.t("callSheet.prompt.path"), prompt.path ?? ctx.none),
        row(ctx.t("callSheet.prompt.fileHash"), prompt.file_hash ?? ctx.none),
      ]),
      ...properties("prompt-slots", ctx.t("callSheet.prompt.slotsSection"), slotRows(prompt)),
    ]),
  ]
}

const outputSections: CallSheetSectionsPresenter = (detail, ctx) => {
  const sentSchema = detail.execution.prompt?.output_schema_sent
  return [
    ...payloadValueSections("output", detail, ctx),
    schemaSection("output-schema", ctx.t(sentSchema === null || sentSchema === undefined ? "callSheet.output.schemaSection" : "callSheet.output.effectiveSchemaSection"),
      sentSchema ?? detail.outputSchema.schema, sentSchema === null || sentSchema === undefined ? detail.outputSchema.source : "run", ctx, true),
    ...(ctx.raw ? [
      ...raw("output-response", ctx.t("callSheet.output.responseSection"), detail.rawResponse ?? "", ctx.t("callSheet.output.noResponse")),
      ...blobSections(detail.blobs, detail.execution, ctx),
    ] : []),
  ]
}

const humanRows = (human: ApiHumanWaitDetail, ctx: SheetContext): readonly PropertyRow[] => [
  row(ctx.t("callSheet.human.waitKind"), human.wait_kind),
  row(ctx.t("callSheet.human.state"), human.state),
  row(ctx.t("callSheet.human.assignee"), human.assignee),
  row(ctx.t("callSheet.human.formType"), human.form_type_id),
  row(ctx.t("callSheet.human.deadline"), human.deadline_at),
  row(ctx.t("callSheet.human.resolvedBy"), human.resolved_by ?? ctx.none),
]

const checksSections: CallSheetSectionsPresenter = ({ execution }, ctx) => {
  const human = execution.human
  return [
    { id: "checks", title: ctx.t("callSheet.checks.section"), body: ctx.raw
      ? { kind: "value", value: execution.checks }
      : { kind: "node", node: <CheckCards checks={execution.checks} /> } },
    ...(execution.rule_firings.length === 0 ? [] : structured("rules", ctx.t("callSheet.checks.rulesSection"), execution.rule_firings)),
    ...(execution.attempts.length === 0 ? [] : structured("attempts", ctx.t("callSheet.checks.attemptsSection"), execution.attempts)),
    ...structured("error", ctx.t("callSheet.checks.errorSection"), execution.error),
    ...(human === null ? [] : properties("human", ctx.t("callSheet.human.section"), humanRows(human, ctx))),
    ...(human === null ? [] : refSections("human-answer", ctx.t("callSheet.human.answerSection"), human.answer_ref, ctx)),
  ]
}

export const CALL_SHEET_SECTIONS: Readonly<Record<Exclude<CallSheetTab, "model">, CallSheetSectionsPresenter>> = {
  input: inputSections,
  prompt: promptSections,
  output: outputSections,
  checks: checksSections,
}
