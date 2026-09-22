import { use } from "react"
import type { NodeProps } from "@xyflow/react"
import { cn } from "cn"
import { useTranslations } from "use-intl"
import { Dot, NODE_KIND, Surface, Tag, Text } from "@/components/studio"
import { nodeHandleSpecs } from "./handles"
import { NodeHandles } from "./node-handles"
import { SelectedNodeContext } from "./selection"
import type { CanvasSize } from "../layout"
import type { StepFlowNode } from "./to-flow"

const STEP_LAYOUT: Readonly<Record<CanvasSize, string>> = {
  md: "gap-1.5 px-3.25 py-2.75",
  sm: "gap-1 px-3 py-2.5",
}

function ProblemDot({ problems }: { readonly problems: number }) {
  if (problems === 0) return null
  return (
    <span className="ml-auto">
      <Dot tone="destructive" size="md" />
    </span>
  )
}

function MetaLine({ meta }: { readonly meta: string }) {
  if (meta === "") return null
  return (
    <Text role="cell" weight="medium" truncate>
      {meta}
    </Text>
  )
}

export function StepNode({ id, data }: NodeProps<StepFlowNode>) {
  const t = useTranslations("flow.canvas")
  const selected = use(SelectedNodeContext) === id
  const kind = NODE_KIND[data.kind]
  return (
    <Surface
      variant="raised"
      radius="lg"
      accent="left-4"
      tone={kind.tone}
      interactive
      selected={selected}
      className={cn("flex h-full w-full flex-col", STEP_LAYOUT[data.size])}
    >
      <div className="flex min-w-0 items-center gap-1.75">
        <Tag size="sm" tone={kind.tone}>
          {kind.code}
        </Tag>
        <Text role="block" weight="semibold" truncate>
          {data.name}
        </Text>
        <ProblemDot problems={data.problems} />
      </div>
      <MetaLine meta={data.meta} />
      <div className="mt-auto flex min-w-0 items-center gap-3">
        <Text role="body" tone="neutral" truncate>
          {t("inputs", { count: data.inputs })}
        </Text>
        <Text role="body" tone="neutral" className="ml-auto shrink-0">
          {t("outputs", { count: data.outputs })}
        </Text>
      </div>
      <NodeHandles specs={nodeHandleSpecs(data.ports, data.reversed)} />
    </Surface>
  )
}
