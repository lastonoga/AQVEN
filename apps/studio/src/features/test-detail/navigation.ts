import type { DatasetRow, RowId, Verdict } from "@/domain"
import { CALL_SHEET_DEFAULTS, type CallSheetSearch } from "@/lib/search"

export type RowNavigation = {
  readonly previous: RowId | null
  readonly next: RowId | null
  readonly nextFailure: RowId | null
}

type Verdicted = { readonly verdict: Verdict }

export const isFailure = (item: Verdicted): boolean => item.verdict === "fail"

export const filterFailures = <T extends Verdicted>(items: readonly T[], failuresOnly: boolean): readonly T[] =>
  failuresOnly ? items.filter(isFailure) : items

const following = (candidates: readonly DatasetRow[], current: DatasetRow): DatasetRow | undefined =>
  candidates.find((row) => row.ordinal > current.ordinal) ?? candidates[0]

const preceding = (candidates: readonly DatasetRow[], current: DatasetRow): DatasetRow | undefined =>
  candidates.findLast((row) => row.ordinal < current.ordinal) ?? candidates.at(-1)

const otherThan = (target: DatasetRow | undefined, current: DatasetRow): RowId | null => {
  if (target === undefined || target.id === current.id) return null
  return target.id
}

export const rowNavigation = (rows: readonly DatasetRow[], current: DatasetRow, failuresOnly: boolean): RowNavigation => {
  const order = filterFailures(rows, failuresOnly)
  const failures = rows.filter(isFailure)
  return {
    previous: otherThan(preceding(order, current), current),
    next: otherThan(following(order, current), current),
    nextFailure: otherThan(following(failures, current), current),
  }
}

export const selectRowSearch =
  (row: RowId) =>
  <S extends CallSheetSearch>({ call: _call, ...rest }: S) => ({ ...rest, ...CALL_SHEET_DEFAULTS, row })

const SHOWN = 1
const HIDDEN = 0

export const rowMatches = (value: string, search: string, keywords: readonly string[] = []): number => {
  const needle = search.toLowerCase()
  return [value, ...keywords].some((text) => text.toLowerCase().includes(needle)) ? SHOWN : HIDDEN
}
