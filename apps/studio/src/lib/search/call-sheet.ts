import { useNavigate, useSearch } from "@tanstack/react-router"
import { CALL_SHEET_TABS, type CallId, type CallSheetTab } from "@/domain"
import { callId as makeCallId } from "@/data/ids"
import type { ROUTE_ID } from "@/lib/routes"
import { parseEnum, parseId } from "./params"

export type CallSheetHost = typeof ROUTE_ID.dataflow | typeof ROUTE_ID.testDetail

export type CallSheetSearch = { readonly call?: CallId; readonly callTab: CallSheetTab }

export type CallSheet = {
  readonly callId: CallId | undefined
  readonly tab: CallSheetTab
  readonly open: (callId: CallId, tab: CallSheetTab) => void
  readonly setTab: (tab: CallSheetTab) => void
  readonly close: () => void
}

export const CALL_SHEET_DEFAULTS = { callTab: "model" } as const satisfies Pick<CallSheetSearch, "callTab">

const parseCall = parseId(makeCallId)
const parseCallTab = parseEnum(CALL_SHEET_TABS)

export const callSheetSearch = (raw: Record<string, unknown>): CallSheetSearch => {
  const callTab = parseCallTab(raw["callTab"]) ?? CALL_SHEET_DEFAULTS.callTab
  const call = parseCall(raw["call"])
  return call === undefined ? { callTab } : { call, callTab }
}

export function useCallSheet(host: CallSheetHost): CallSheet {
  const navigate = useNavigate({ from: host })
  const current = callSheetSearch(useSearch({ from: host }))
  return {
    callId: current.call,
    tab: current.callTab,
    open: (callId, tab) => {
      void navigate({ search: (prev) => ({ ...prev, call: callId, callTab: tab }), resetScroll: false })
    },
    setTab: (tab) => {
      void navigate({ search: (prev) => ({ ...prev, callTab: tab }), replace: true, resetScroll: false })
    },
    close: () => {
      void navigate({ search: ({ call: _call, ...rest }) => ({ ...rest, ...CALL_SHEET_DEFAULTS }), replace: true, resetScroll: false })
    },
  }
}
