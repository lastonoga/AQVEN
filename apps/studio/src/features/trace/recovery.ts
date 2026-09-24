import type { ApiExecution, ApiExecutionAddress, ApiItemRecovery } from "@/domain"

export type RecoveredItem = { readonly map: ApiExecutionAddress; readonly recovery: ApiItemRecovery }

const NESTED_SEPARATOR = "__"
const POLICY_SEPARATOR = ":"

export const policyName = (policy: string): string => policy.split(POLICY_SEPARATOR).at(-1) ?? policy

const sameScope = (outer: string | number | null, inner: string | number | null): boolean => outer === null || outer === inner

const covers = (item: RecoveredItem, address: ApiExecutionAddress): boolean =>
  address.node_id.startsWith(`${item.map.node_id}${NESTED_SEPARATOR}`) &&
  address.item_index === item.recovery.item_index &&
  sameScope(item.map.branch_key, address.branch_key) &&
  sameScope(item.map.iteration, address.iteration)

export const recoveredItems = (executions: readonly ApiExecution[]): readonly RecoveredItem[] =>
  executions.flatMap((execution) => execution.recovered_items.map((recovery) => ({ map: execution.address, recovery })))

export const recoveryOf = (items: readonly RecoveredItem[], execution: ApiExecution): ApiItemRecovery | null => {
  if (execution.status === "ok") return null
  return items.find((item) => covers(item, execution.address))?.recovery ?? null
}
