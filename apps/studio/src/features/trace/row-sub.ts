import type { CallColumn, MatrixGroup, RowKey, RowSpec, StageKind } from "@/domain"
import type { MatrixGround } from "@/components/studio"
import { rowRef, score } from "@/lib/format"
import type { Translator } from "@/i18n/translator"
import { isHeaded } from "./context"

type SubRule = (group: MatrixGroup, t: Translator) => string | undefined

const noSub: SubRule = () => undefined

const hasInputParts = (column: CallColumn): boolean => column.input?.kind === "parts"

const hasOutputParts = (column: CallColumn): boolean => column.output?.kind === "parts"

export const groupHasParts = (group: MatrixGroup): boolean =>
  group.shared?.input?.kind === "parts" || group.columns.some((column) => hasInputParts(column) || hasOutputParts(column))

const CALL_SUB: Partial<Readonly<Record<StageKind, (t: Translator) => string>>> = {
  map: (t) => t("domain.matrixSub.mapItem"),
  loop: (t) => t("domain.matrixSub.loopBody"),
  parallel: (t) => t("domain.matrixSub.assetFanOut"),
  diverge: (t) => t("domain.matrixSub.divergeBranch"),
}

const callSub: SubRule = (group, t) => {
  if (!isHeaded(group) || group.kind === undefined) return undefined
  return CALL_SUB[group.kind]?.(t)
}

const inputSub: SubRule = (group, t) => {
  const shared = group.shared?.input
  if (group.columns.some(hasInputParts) || shared?.kind === "parts") return t("domain.matrixSub.multimodalParts")
  if (shared?.kind === "refs" && shared.row !== undefined) return t("domain.matrixSub.datasetRow", { row: rowRef(shared.row) })
  if (isHeaded(group) && group.kind === "map") return t("domain.matrixSub.source")
  return undefined
}

const outputSub: SubRule = (group, t) => {
  if (group.columns.some(hasOutputParts)) return t("domain.matrixSub.typedParts")
  if (group.columns.some((column) => column.output?.kind === "verdict")) return t("domain.matrixSub.verdict")
  return undefined
}

const thresholdOf = (group: MatrixGroup): number | undefined =>
  group.columns.map((column) => column.check?.score?.threshold).find((threshold) => threshold !== undefined)

const postCheckSub: SubRule = (group, t) => {
  const threshold = thresholdOf(group)
  if (threshold !== undefined) return t("domain.matrixSub.scorerThreshold", { threshold: score(threshold) })
  if (groupHasParts(group)) return t("domain.matrixSub.perModality")
  return t("domain.matrixSub.validatorsScorers")
}

const assertionsSub: SubRule = (group, t) => {
  const ratio = group.columns[0]?.check?.ratio
  if (ratio === undefined) return undefined
  return t("domain.matrixSub.perRow", { total: ratio.total })
}

export const ROW_SUB: Readonly<Record<RowKey, SubRule>> = {
  columns: (group, t) => t("domain.matrixSub.inParallel", { count: group.columns.length }),
  call: callSub,
  agent: (_group, t) => t("domain.matrixSub.modelConfig"),
  model: (_group, t) => t("domain.matrixSub.costTime"),
  input: inputSub,
  prompt: noSub,
  output: outputSub,
  postCheck: postCheckSub,
  assertions: assertionsSub,
}

export const rowSub = (row: RowSpec, group: MatrixGroup, t: Translator): string | undefined => row.detail ?? ROW_SUB[row.key](group, t)

const GIVEN_ROWS: ReadonlySet<RowKey> = new Set<RowKey>(["input", "prompt"])

export const rowGround = (key: RowKey, headed: boolean): MatrixGround => (GIVEN_ROWS.has(key) && !headed ? "subtle" : "card")

export const rowEmphasis = (key: RowKey, headed: boolean): boolean => key === "output" && !headed
