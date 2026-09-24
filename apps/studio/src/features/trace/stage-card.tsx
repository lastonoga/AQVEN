import type { ReactNode } from "react"
import { Heading, NODE_KIND, Surface, Text, type TagSpec } from "@/components/studio"
import { joinMeta, usd } from "@/lib/format"
import { latencyText } from "./agent-cells"
import { AttemptsLadder } from "./attempts-ladder"
import { groupContext, type TraceScope } from "./context"
import { failedItemsTags } from "./failed-items"
import { stageItemFailures } from "./failures"
import { GroupMatrix } from "./group-matrix"
import type { StageRun } from "./model"
import { OpenNestedBlock } from "./nested-block"

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
      description={scope.t(`domain.executionStatus.${stage.status}`)}
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
