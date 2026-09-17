import type { ReactNode } from "react"
import type {
  CallDetail,
  CallSheetTab,
  CheckResult,
  ContentPart,
  FreezeEntry,
  HistoryEntry,
  JudgeVote,
  ModelInfo,
  ParsedField,
  TextLine,
  Verdict,
} from "@/domain"
import { OUTCOME_TONE, PROVENANCE, VERDICT_OUTCOME, type PropertyRow, type SectionSpec } from "@/components/studio"
import { count, joinMeta, orNone as orNoneText, PAIR_SEPARATOR, param, rowRef, runRef, score, usd } from "@/lib/format"
import { comparisonLines, diffLines, plainLines, templateLines } from "@/lib/text"
import type { Translator } from "@/i18n/translator"
import type { SectionContext } from "./context"

export type CallSheetSectionsPresenter = (detail: CallDetail, ctx: SectionContext) => readonly SectionSpec[]

type ParsedResult = ParsedField["result"]
type ParsedKind = ParsedResult["kind"]
type ParsedResultOf<K extends ParsedKind> = ParsedResult & { readonly kind: K }
type RowValue = Pick<PropertyRow, "value" | "tone">
type ParsedViews = { readonly [K in ParsedKind]: (result: ParsedResultOf<K>, t: Translator) => RowValue }

type Judges = CallDetail["checks"]["judges"]

type FreezeKind = FreezeEntry["kind"]
type FreezeEntryOf<K extends FreezeKind> = FreezeEntry & { readonly kind: K }
type FreezeViews = { readonly [K in FreezeKind]: (entry: FreezeEntryOf<K>, t: Translator) => PropertyRow }

const ORDER_SEPARATOR = " → "
const LIST_SEPARATOR = ", "

const MODEL_FIELDS = ["provider", "model", "snapshot", "api", "region", "quantization", "context", "billing"] as const satisfies readonly (keyof ModelInfo)[]

const VERDICT_EMPHASIS: Readonly<Record<Verdict, Pick<PropertyRow, "tone">>> = {
  pass: {},
  fail: { tone: OUTCOME_TONE[VERDICT_OUTCOME.fail] },
}

const row = (key: PropertyRow["key"], value: PropertyRow["value"]): PropertyRow => ({ key, value })

const properties = (id: string, title: ReactNode, rows: readonly PropertyRow[]): readonly SectionSpec[] => {
  if (rows.length === 0) return []
  return [{ id, title, body: { kind: "properties", rows } }]
}

const text = (id: string, title: ReactNode, lines: readonly TextLine[]): readonly SectionSpec[] => {
  if (lines.length === 0) return []
  return [{ id, title, body: { kind: "text", lines } }]
}

const parts = (id: string, title: ReactNode, items: readonly ContentPart[]): readonly SectionSpec[] => {
  if (items.length === 0) return []
  return [{ id, title, body: { kind: "parts", parts: items } }]
}

const orNone = (value: string, t: Translator): string => orNoneText(value, t("common.none"))

const verdictOf = (pass: boolean): Verdict => (pass ? "pass" : "fail")

const maxTokensValue = ({ max_tokens: maxTokens }: CallDetail["params"], t: Translator): string => {
  const { value, changedIn, previous } = maxTokens
  if (changedIn === undefined || previous === undefined) return String(value)
  return t("callSheet.model.changedValue", { value: String(value), revision: changedIn, previous: String(previous) })
}

const seedValue = (seed: number | null, t: Translator): string => (seed === null ? t("common.none") : String(seed))

const modelSections: CallSheetSectionsPresenter = ({ model, routing, params, billing, attempt }, { t }) => [
  ...properties(
    "call-model-provider",
    t("callSheet.model.providerSection"),
    MODEL_FIELDS.map((field) => row(t(`callSheet.model.${field}`), orNone(model[field], t))),
  ),
  ...properties("call-model-routing", t("callSheet.model.routingSection"), [
    row(t("callSheet.model.profile"), orNone(routing.profile, t)),
    row(t("callSheet.model.order"), orNone(routing.order.join(ORDER_SEPARATOR), t)),
    row(t("callSheet.model.fallbackReason"), orNone(routing.fallbackReason, t)),
    row(t("callSheet.model.retries"), orNone(routing.retries, t)),
    row(t("callSheet.model.timeout"), t("common.units.seconds", { value: routing.timeoutS })),
    row(t("callSheet.model.cassette"), orNone(routing.cassette, t)),
  ]),
  ...properties("call-model-params", t("callSheet.model.paramsSection"), [
    row("temperature", param(params.temperature)),
    row("top_p", param(params.top_p)),
    row("max_tokens", maxTokensValue(params, t)),
    row("seed", seedValue(params.seed, t)),
    row("stop", orNone(params.stop.join(LIST_SEPARATOR), t)),
    row("response_format", orNone(params.response_format, t)),
  ]),
  ...properties("call-model-billed", t("callSheet.model.billedSection"), [
    row(t("callSheet.model.inputOutput"), t("callSheet.model.tokensInOut", { input: count(billing.inputTokens), output: count(billing.outputTokens) })),
    row(t("callSheet.model.pricePer1k"), [usd(billing.pricePer1k.inputUsd, 3), usd(billing.pricePer1k.outputUsd, 3)].join(PAIR_SEPARATOR)),
    row(t("callSheet.model.attemptN", { n: attempt }), usd(billing.attemptCostUsd)),
    row(t("callSheet.model.failedAttempts"), usd(billing.failedAttemptsCostUsd)),
    row(t("callSheet.model.callTotal"), usd(billing.callTotalUsd)),
  ]),
]

const FREEZE_ROW: FreezeViews = {
  recorded: (entry, t) => row(entry.node, t("callSheet.input.freezeRecorded", { run: runRef(entry.fromRun) })),
  knowledge: (entry, t) => row(t("callSheet.input.freezeKnowledge"), entry.value),
}

const freezeRow = <K extends FreezeKind>(kind: K, entry: FreezeEntryOf<K>, t: Translator): PropertyRow => {
  const view: (entry: FreezeEntryOf<K>, t: Translator) => PropertyRow = FREEZE_ROW[kind]
  return view(entry, t)
}

const inputSections: CallSheetSectionsPresenter = ({ input, row: rowId }, { t }) => [
  ...parts("call-input-parts", t("callSheet.input.partsSection", { count: input.parts.length }), input.parts),
  ...properties(
    "call-input-slots",
    t("callSheet.input.slotsSection", { count: input.slots.length }),
    input.slots.map((slot) => row({ glyph: PROVENANCE[slot.provenance].glyph, text: slot.label }, slot.value ?? t("common.none"))),
  ),
  ...text("call-input-row", t("callSheet.input.rowValuesSection", { row: rowRef(rowId) }), input.rowValues.map((value) => [value])),
  ...properties(
    "call-input-freeze",
    t("callSheet.input.freezeSection"),
    input.freeze.map((entry) => freezeRow(entry.kind, entry, t)),
  ),
]

const templateBody = ({ input, prompt }: CallDetail): readonly TextLine[] => {
  if (prompt.template.text.length === 0) return []
  return templateLines(prompt.template.text, input.slots)
}

const promptSections: CallSheetSectionsPresenter = (detail, { t, tags }) => [
  ...text(
    "call-prompt-template",
    t.rich("callSheet.prompt.templateSection", { ...tags, template: detail.prompt.template.id, revision: detail.prompt.template.revision }),
    templateBody(detail),
  ),
  ...text("call-prompt-system", t("callSheet.prompt.systemSection"), plainLines(detail.prompt.system)),
  ...text("call-prompt-user", t("callSheet.prompt.userSection", { tokens: detail.prompt.user.tokens }), plainLines(detail.prompt.user.text)),
  ...text("call-prompt-diff", t("callSheet.prompt.diffSection"), diffLines(detail.prompt.diff)),
]

const PARSED_VALUE: ParsedViews = {
  ok: (result, t) => ({
    value:
      result.max === undefined
        ? t("callSheet.output.parsedOk", { length: result.length })
        : t("callSheet.output.parsedOkOf", { length: result.length, max: result.max }),
  }),
  value: (result) => ({ value: result.value }),
  empty: (_result, t) => ({ value: t("callSheet.output.emptyString"), tone: OUTCOME_TONE[VERDICT_OUTCOME.fail] }),
}

const parsedValue = <K extends ParsedKind>(kind: K, result: ParsedResultOf<K>, t: Translator): RowValue => {
  const view: (result: ParsedResultOf<K>, t: Translator) => RowValue = PARSED_VALUE[kind]
  return view(result, t)
}

const parsedRow = (field: ParsedField, t: Translator): PropertyRow => ({
  key: field.path,
  ...parsedValue(field.result.kind, field.result, t),
})

const validationLines = (errors: readonly string[], t: Translator): readonly TextLine[] => [
  ...errors.map((error): TextLine => [{ text: error, mark: "remove" }]),
  [t("callSheet.output.validationRest", { errors: errors.length })],
]

const comparisonBody = ({ comparison }: CallDetail["output"], t: Translator): readonly TextLine[] => [
  ...comparisonLines(comparison.actual, comparison.expected, {
    actual: t("callSheet.output.actual"),
    expected: t("callSheet.output.expected"),
  }),
  [t("callSheet.output.scores", { semantic: score(comparison.semantic), factual: score(comparison.factual) })],
]

const outputSections: CallSheetSectionsPresenter = ({ output }, { t, tags }) => [
  ...parts("call-output-parts", t("callSheet.output.partsSection", { count: output.parts.length }), output.parts),
  ...text("call-output-raw", t("callSheet.output.rawSection", { tokens: output.raw.tokens }), plainLines(output.raw.text)),
  ...properties(
    "call-output-parsed",
    t.rich("callSheet.output.parsedSection", { ...tags, type: output.parsed.type }),
    output.parsed.fields.map((field) => parsedRow(field, t)),
  ),
  ...text("call-output-validation", t("callSheet.output.validationSection"), validationLines(output.validationErrors, t)),
  ...text("call-output-comparison", t("callSheet.output.comparisonSection"), comparisonBody(output, t)),
]

const assertionRow = (check: CheckResult, t: Translator): PropertyRow => {
  const verdict = verdictOf(check.pass)
  return { key: check.name, value: t(`domain.verdict.${verdict}`), ...VERDICT_EMPHASIS[verdict] }
}

const judgeRow = (vote: JudgeVote, t: Translator): PropertyRow =>
  row(t("callSheet.checks.judgeLabel", { node: vote.node, model: vote.model }), score(vote.score))

const decisionRow = ({ decision }: Judges, t: Translator): PropertyRow =>
  row(
    t("callSheet.checks.decisionLabel"),
    t("callSheet.checks.decision", { verdict: decision.verdict, passed: decision.passed, total: decision.total }),
  )

const judgesSection = (judges: Judges, { t, tags }: SectionContext): readonly SectionSpec[] => {
  if (judges.votes.length === 0) return []
  return properties("call-checks-judges", t.rich("callSheet.checks.judgesSection", { ...tags, quorum: judges.quorum }), [
    ...judges.votes.map((vote) => judgeRow(vote, t)),
    decisionRow(judges, t),
  ])
}

const draftLabel = (entry: HistoryEntry, t: Translator): string | null => (entry.draft ? t("callSheet.checks.draft") : null)

const historyRow = (entry: HistoryEntry, t: Translator): PropertyRow =>
  row(
    joinMeta([entry.revision, draftLabel(entry, t)]),
    t("callSheet.checks.historyValue", { status: t(`domain.verdict.${entry.verdict}`), note: entry.note }),
  )

const assertionSections: CallSheetSectionsPresenter = ({ checks, row: rowId }, { t, tags }) => [
  ...properties(
    "call-checks-assertions",
    t("callSheet.checks.assertionsSection", { row: rowRef(rowId) }),
    checks.assertions.map((check) => assertionRow(check, t)),
  ),
  ...judgesSection(checks.judges, { t, tags }),
  ...properties("call-checks-history", t("callSheet.checks.historySection"), [
    ...checks.history.entries.map((entry) => historyRow(entry, t)),
    row(t("callSheet.checks.dataset"), checks.history.dataset),
  ]),
]

export const CALL_SHEET_SECTIONS: Readonly<Record<CallSheetTab, CallSheetSectionsPresenter>> = {
  model: modelSections,
  input: inputSections,
  prompt: promptSections,
  output: outputSections,
  assertions: assertionSections,
}
