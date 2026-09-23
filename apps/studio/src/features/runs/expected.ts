import type { ApiDatasetCase } from "@/domain"
import { diffValues, type FieldDiff, type FieldState } from "./value-diff"

export type DatasetItem = { readonly datasetId: string; readonly caseName: string }

export type ExpectedCase =
  | { readonly kind: "none" }
  | { readonly kind: "unavailable"; readonly item: DatasetItem }
  | { readonly kind: "ready"; readonly item: DatasetItem; readonly expected: unknown }

export const EXPECTED_STATES = ["match", "mismatch", "missing", "extra"] as const

export type ExpectedState = (typeof EXPECTED_STATES)[number]

export type ExpectedRow = {
  readonly path: string
  readonly expected: string | null
  readonly actual: string | null
  readonly state: ExpectedState
}

export type ExpectedComparison = {
  readonly rows: readonly ExpectedRow[]
  readonly checked: number
  readonly matched: number
  readonly extra: number
}

const ITEM_SEPARATOR = "/"

const EXPECTED_STATE: Readonly<Record<FieldState, ExpectedState>> = {
  same: "match",
  changed: "mismatch",
  onlyLeft: "missing",
  onlyRight: "extra",
}

const NONE: ExpectedCase = { kind: "none" }

export const datasetItemOf = (itemId: string | null | undefined): DatasetItem | null => {
  if (itemId === null || itemId === undefined) return null
  const separator = itemId.indexOf(ITEM_SEPARATOR)
  if (separator <= 0 || separator === itemId.length - 1) return null
  return { datasetId: itemId.slice(0, separator), caseName: itemId.slice(separator + 1) }
}

export const expectedCaseOf = (item: DatasetItem | null, found: ApiDatasetCase | null): ExpectedCase => {
  if (item === null) return NONE
  if (found === null) return { kind: "unavailable", item }
  if (found.expected_output === undefined || found.expected_output === null) return NONE
  return { kind: "ready", item, expected: found.expected_output }
}

const rowOf = (diff: FieldDiff): ExpectedRow => ({
  path: diff.path,
  expected: diff.left,
  actual: diff.right,
  state: EXPECTED_STATE[diff.state],
})

const isChecked = (row: ExpectedRow): boolean => row.state !== "extra"

export const compareExpected = (expected: unknown, actual: unknown): ExpectedComparison => {
  const rows = diffValues(expected, actual).map(rowOf)
  const checked = rows.filter(isChecked)
  return {
    rows: checked,
    checked: checked.length,
    matched: checked.filter((row) => row.state === "match").length,
    extra: rows.length - checked.length,
  }
}
