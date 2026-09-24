import type { ReactNode } from "react"
import { ITEM_RECOVERY_DECISIONS, type ItemRecoveryDecision } from "@/domain"
import { Heading, NODE_KIND, Surface, Tag, Text, type TagSpec } from "@/components/studio"
import { joinMeta, usd } from "@/lib/format"
import { latencyText } from "./agent-cells"
import { AttemptsLadder } from "./attempts-ladder"
import { groupContext, type TraceScope } from "./context"
import { failedItemsTags } from "./failed-items"
import { stageItemFailures } from "./failures"
import { GroupMatrix } from "./group-matrix"
import type { RecoveryCell, StageRun } from "./model"
import { OpenNestedBlock } from "./nested-block"
import { RECOVERED_TONE } from "./paint"

export type StageCardProps = { readonly stage: StageRun; readonly scope: TraceScope }

const ROOT_DEPTH = 1

const kindTag = (stage: StageRun): TagSpec => ({ tone: NODE_KIND[stage.kind].tone, fill: "tint", size: "sm", children: NODE_KIND[stage.kind].code })

function ExitFooter({ stage, scope }: StageCardProps) {
  const exit = stage.exit
  if (exit === null) return null
  const scores = exit.scores.filter((score): score is number => score !== null)
  return (
    <Text as="div" role="small" tone="neutral" className="border-t border-border px-2.5 py-2">
      {joinMeta([
        scope.t("trace.exit.reason", { reason: exit.reason }),
        exit.selectedIteration === null ? null : scope.t("trace.exit.selected", { iteration: exit.selectedIteration }),
        scores.length === 0 ? null : scope.t("trace.exit.scores", { scores: scores.join(", ") }),
      ])}
    </Text>
  )
}

type RecoverySummary = { readonly decision: ItemRecoveryDecision; readonly count: number; readonly policy: string }

const POLICY_JOIN = ", "

const recoverySummaries = (recoveries: readonly RecoveryCell[]): readonly RecoverySummary[] =>
  ITEM_RECOVERY_DECISIONS.map((decision) => {
    const matching = recoveries.filter((recovery) => recovery.decision === decision)
    return { decision, count: matching.length, policy: [...new Set(matching.map((recovery) => recovery.policy))].join(POLICY_JOIN) }
  }).filter((summary) => summary.count > 0)

function StageStatus({ stage, scope }: StageCardProps) {
  const status = scope.t(`domain.executionStatus.${stage.status}`)
  const summaries = recoverySummaries(stage.recoveries)
  if (summaries.length === 0) return status
  return (
    <span className="inline-flex items-center gap-2">
      {status}
      {summaries.map((summary) => (
        <Tag
          key={summary.decision}
          tone={RECOVERED_TONE}
          fill="soft"
          size="micro"
          title={scope.t(`trace.recovery.tagTitle.${summary.decision}`, { policy: summary.policy, count: summary.count })}
        >
          {scope.t(`trace.recovery.tag.${summary.decision}`, { count: summary.count })}
        </Tag>
      ))}
    </span>
  )
}

function StageTotals({ stage, scope }: StageCardProps) {
  return (
    <Text role="tiny" weight="medium" tone="default">
      {joinMeta([usd(stage.costUsd), latencyText(stage.latencyMs), scope.t("trace.stage.calls", { count: stage.fanOut })])}
    </Text>
  )
}

export function StageCard({ stage, scope }: StageCardProps): ReactNode {
  const contexts = stage.groups.map((group) => groupContext(scope, group, ROOT_DEPTH))
  return (
    <Heading
      size="block"
      title={stage.nodeId}
      tags={[kindTag(stage), ...failedItemsTags(stageItemFailures(stage), scope.t, "sm")]}
      description={<StageStatus stage={stage} scope={scope} />}
      trailing={<StageTotals stage={stage} scope={scope} />}
    >
      <div className="flex flex-col gap-2.75">
        <Surface variant="panel" className="overflow-hidden">
          <div className="overflow-x-auto">
            {contexts.map((ctx) => (
              <GroupMatrix key={ctx.group.id} ctx={ctx} label={stage.nodeId} />
            ))}
          </div>
          {stage.ladders.map((ladder) => (
            <AttemptsLadder key={ladder.columnId} ladder={ladder} t={scope.t} />
          ))}
          <ExitFooter stage={stage} scope={scope} />
        </Surface>
        {contexts.map((ctx) => (
          <OpenNestedBlock key={ctx.group.id} ctx={ctx} />
        ))}
      </div>
    </Heading>
  )
}
