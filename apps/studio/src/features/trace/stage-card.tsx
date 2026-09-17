import type { ReactNode } from "react"
import { Play } from "lucide-react"
import type { StageRun } from "@/domain"
import { Heading, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { AttemptsLadder } from "./attempts-ladder"
import { groupContext, type TraceScope, type TraceVariant } from "./context"
import { describeStage, stageKindTag, stageTotals } from "./descriptions"
import { ExitConditions } from "./exit-conditions"
import { GroupMatrix } from "./group-matrix"
import { JoinFooter } from "./join-footer"
import { OpenNestedBlock } from "./nested-block"

type StagePartProps = { readonly stage: StageRun; readonly scope: TraceScope }

type StageFooter = (stage: StageRun, scope: TraceScope) => readonly ReactNode[]

const ROOT_DEPTH = 1

const outputsOf = (stage: StageRun): number => stage.fanOut ?? stage.groups[0]?.columns.length ?? 0

const STAGE_FOOTERS: readonly StageFooter[] = [
  (stage, scope) => (stage.attempts === undefined ? [] : [<AttemptsLadder key="attempts" ladder={stage.attempts} t={scope.t} />]),
  (stage, scope) => (stage.exit === undefined ? [] : [<ExitConditions key="exit" exit={stage.exit} t={scope.t} />]),
  (stage, scope) => (stage.join === undefined ? [] : [<JoinFooter key="join" join={stage.join} outputs={outputsOf(stage)} t={scope.t} />]),
]

function Totals({ stage, scope }: StagePartProps) {
  return (
    <Text role="tiny" weight="medium" tone="default">
      {stageTotals(stage, scope.t)}
    </Text>
  )
}

function RunTrailing({ stage, scope }: StagePartProps) {
  return (
    <>
      <Button variant="outline" size="xs" onClick={noop}>
        <Play aria-hidden fill="currentColor" />
        {scope.t("trace.stage.runStage")}
      </Button>
      <Totals stage={stage} scope={scope} />
    </>
  )
}

const STAGE_TRAILING: Readonly<Record<TraceVariant, (props: StagePartProps) => ReactNode>> = {
  run: RunTrailing,
  trace: Totals,
}

export function StageCard({ stage, scope }: StagePartProps) {
  const Trailing = STAGE_TRAILING[scope.variant]
  const contexts = stage.groups.map((group) => groupContext(scope, group, group.id, ROOT_DEPTH))
  return (
    <Heading
      size="block"
      title={stage.title}
      tags={[stageKindTag(stage, scope.variant, scope.t)]}
      description={describeStage(stage, scope.t)}
      trailing={<Trailing stage={stage} scope={scope} />}
    >
      <div className="flex flex-col gap-2.75">
        <Surface variant="panel" className="overflow-hidden">
          <div className="overflow-x-auto">
            {contexts.map((ctx) => (
              <GroupMatrix key={ctx.group.id} ctx={ctx} label={stage.title} />
            ))}
          </div>
          {STAGE_FOOTERS.flatMap((footer) => footer(stage, scope))}
        </Surface>
        {contexts.map((ctx) => (
          <OpenNestedBlock key={ctx.group.id} ctx={ctx} />
        ))}
      </div>
    </Heading>
  )
}
