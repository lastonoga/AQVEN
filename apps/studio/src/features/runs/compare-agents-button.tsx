import { useTranslations } from "use-intl"
import type { ApiNode, ApiRunSnapshot } from "@/domain"
import { HandoffButton } from "@/features/chat-handoff"
import { compareAgentsPrompt, stepAgents } from "./compare-agents"
import { datasetItemOf } from "./expected"

export type CompareAgentsButtonProps = {
  readonly step: string
  readonly snapshot: ApiRunSnapshot
  readonly nodes: readonly ApiNode[]
}

export function CompareAgentsButton({ step, snapshot, nodes }: CompareAgentsButtonProps) {
  const t = useTranslations("runs.compareAgents")
  const agents = stepAgents(step, nodes, snapshot.executions)
  if (agents.length === 0) return null
  const prompt = (): string => compareAgentsPrompt({
    flowId: snapshot.flow_id,
    step,
    runId: snapshot.run_id,
    item: datasetItemOf(snapshot.dataset_item_id),
    agents,
  })
  return <HandoffButton label={t("label", { node: step })} prompt={prompt} size="sm" />
}
