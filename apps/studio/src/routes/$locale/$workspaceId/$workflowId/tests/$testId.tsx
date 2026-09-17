import { createFileRoute, stripSearchParams } from "@tanstack/react-router"
import type { DatasetRow, RowId } from "@/domain"
import * as ids from "@/data/ids"
import { TestDetailScreen } from "@/features/test-detail"
import { CALL_SHEET_DEFAULTS, callSheetSearch, parseFlag, parseId, type CallSheetSearch } from "@/lib/search"
import { loadWhen } from "@/routes/-load"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type TestDetailSearch = CallSheetSearch & {
  readonly row?: RowId
  readonly failures: boolean
}

const parseRow = parseId(ids.rowId)

const parseTestDetailSearch = (raw: RawSearch): TestDetailSearch => ({
  ...callSheetSearch(raw),
  failures: parseFlag(raw["failures"]) ?? false,
  ...optional("row", parseRow(raw["row"])),
})

const TEST_DETAIL_DEFAULTS = { ...CALL_SHEET_DEFAULTS, failures: false } as const

const defaultRowId = (rows: readonly DatasetRow[]): RowId | null =>
  (rows.find((row) => row.verdict === "fail") ?? rows[0])?.id ?? null

const validateTestDetailSearch = searchValidator(parseTestDetailSearch)

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/tests/$testId")({
  params: {
    parse: ({ testId }) => ({ testId: ids.testId(testId) }),
    stringify: ({ testId }) => ({ testId }),
  },
  validateSearch: validateTestDetailSearch,
  search: { middlewares: [stripSearchParams(TEST_DETAIL_DEFAULTS)] },
  loaderDeps: ({ search: { row, call } }) => ({ row, call }),
  loader: async ({ context: { sources }, params, deps }) => {
    const [detail, call] = await Promise.all([
      sources.tests.detail(params, params.testId),
      loadWhen(deps.call, (callId) => sources.runs.call(params, callId)),
    ])
    const rows = detail?.dataset.rows ?? []
    const rowId = deps.row ?? defaultRowId(rows)
    const row = rows.find((candidate) => candidate.id === rowId) ?? null
    const trace = await loadWhen(rowId, (id) => sources.tests.trace(params, params.testId, id))
    return { detail, rowId, row, trace, call }
  },
  component: TestDetailScreen,
})
