import type { NodeKind } from "@/domain"
import type { MatrixGround } from "@/components/studio"
import type { Translator } from "@/i18n/translator"
import type { MatrixGroup, RowKey } from "./model"

type SubRule = (group: MatrixGroup, t: Translator) => string | undefined

const noSub: SubRule = () => undefined

type FanOutSub = (group: MatrixGroup, t: Translator) => string

const iterationCount = (group: MatrixGroup): number =>
  new Set(group.columns.map((column) => column.address.iteration).filter((value) => value !== null)).size

const FAN_OUT: Partial<Readonly<Record<NodeKind, FanOutSub>>> = {
  parallel: (group, t) => t("trace.matrixSub.branches", { count: group.columns.length }),
  map: (group, t) => t("trace.matrixSub.items", { count: group.columns.length }),
  loop: (group, t) => t("trace.matrixSub.iterations", { count: iterationCount(group), calls: group.columns.length }),
  switch: (group, t) => t("trace.matrixSub.takenBranch", { count: group.columns.length }),
  call: (group, t) => t("trace.matrixSub.calledNodes", { count: group.columns.length }),
}

const callSub: SubRule = (group, t) => FAN_OUT[group.kind]?.(group, t)

const inputSub: SubRule = (group, t) =>
  group.columns.some((column) => column.input?.kind === "upstream") ? t("trace.matrixSub.upstream") : undefined

const promptSub: SubRule = (_group, t) => t("trace.matrixSub.modelRequest")

const postCheckSub: SubRule = (_group, t) => t("trace.matrixSub.outputChecks")

export const ROW_SUB: Readonly<Record<RowKey, SubRule>> = {
  call: callSub,
  agent: (_group, t) => t("trace.matrixSub.declared"),
  model: (_group, t) => t("trace.matrixSub.costTime"),
  input: inputSub,
  prompt: promptSub,
  output: noSub,
  postCheck: postCheckSub,
}

export const rowSub = (key: RowKey, group: MatrixGroup, t: Translator): string | undefined => ROW_SUB[key](group, t)

const GIVEN_ROWS: ReadonlySet<RowKey> = new Set<RowKey>(["input", "prompt"])

export const rowGround = (key: RowKey): MatrixGround => (GIVEN_ROWS.has(key) ? "subtle" : "card")

export const rowEmphasis = (key: RowKey): boolean => key === "output"
