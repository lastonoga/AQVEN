import type { ApiItemRecovery, ApiRunSnapshot, ItemRecoveryDecision } from "@/domain"
import { recoveredItems, recoveryOf } from "@/features/trace"

export type RecoveredDecision = ItemRecoveryDecision | "mixed"

export type NodeFailures =
  | { readonly kind: "none" }
  | { readonly kind: "failed"; readonly count: number }
  | { readonly kind: "recovered"; readonly count: number; readonly decision: RecoveredDecision }

const NONE: NodeFailures = { kind: "none" }

const decisionOf = (recoveries: ReadonlySet<ApiItemRecovery>): RecoveredDecision => {
  const decisions = new Set([...recoveries].map((recovery) => recovery.decision))
  const [only] = decisions
  return decisions.size === 1 && only !== undefined ? only : "mixed"
}

export const nodeFailures = (snapshot: ApiRunSnapshot): NodeFailures => {
  const count = snapshot.node_counts.failed
  if (count === 0) return NONE
  const items = recoveredItems(snapshot.executions)
  const recoveries = snapshot.executions
    .filter((execution) => execution.status === "failed")
    .map((execution) => recoveryOf(items, execution))
    .filter((recovery): recovery is ApiItemRecovery => recovery !== null)
  if (recoveries.length !== count) return { kind: "failed", count }
  const distinct = new Set(recoveries)
  return { kind: "recovered", count: distinct.size, decision: decisionOf(distinct) }
}
