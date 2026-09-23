import type { ApiExecutionAddress, NodeId } from "@/domain"
import * as ids from "@/data/ids"
import { CALL_SHEET_TABS, type CallSheetTab } from "@/features/call-sheet"
import { parseEnum, parseId, parseIndex, parseText } from "@/lib/search"
import { optional, type RawSearch } from "@/routes/-search"

export type RunAddressSearch = {
  readonly stage?: string
  readonly node?: NodeId
  readonly branch?: string
  readonly iter?: number
  readonly item?: number
  readonly tab?: CallSheetTab
}

const parseNode = parseId(ids.nodeId)
const parseTab = parseEnum(CALL_SHEET_TABS)

export const parseRunAddressSearch = (raw: RawSearch): RunAddressSearch => ({
  ...optional("stage", parseText(raw["stage"])),
  ...optional("node", parseNode(raw["node"])),
  ...optional("branch", parseText(raw["branch"])),
  ...optional("iter", parseIndex(raw["iter"])),
  ...optional("item", parseIndex(raw["item"])),
  ...optional("tab", parseTab(raw["tab"])),
})

export const addressOf = (search: RunAddressSearch): ApiExecutionAddress | null => {
  if (search.node === undefined) return null
  return { node_id: search.node, branch_key: search.branch ?? null, iteration: search.iter ?? null, item_index: search.item ?? null }
}
