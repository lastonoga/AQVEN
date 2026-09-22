import { use } from "react"
import type { NodeProps } from "@xyflow/react"
import { useTranslations } from "use-intl"
import { Dot, NODE_KIND, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { nodeHandleSpecs } from "./handles"
import { NodeHandles } from "./node-handles"
import { SelectedNodeContext } from "./selection"
import type { CanvasSize } from "../layout"
import type { ContainerFlowNode } from "./to-flow"

const HEADER_LAYOUT: Readonly<Record<CanvasSize, string>> = {
  md: "h-9 gap-2.25 px-3.5",
  sm: "h-9 gap-2 px-3",
}

function ProblemDot({ problems }: { readonly problems: number }) {
  if (problems === 0) return null
  return <Dot tone="destructive" size="md" />
}

export function ContainerNode({ id, data }: NodeProps<ContainerFlowNode>) {
  const t = useTranslations("flow.canvas")
  const selected = use(SelectedNodeContext) === id
  const kind = NODE_KIND[data.kind]
  return (
    <Surface
      variant={data.kind === "switch" ? "outlined" : "tinted"}
      tone={kind.tone}
      interactive
      selected={selected}
      className="h-full w-full"
    >
      <Toolbar className={HEADER_LAYOUT[data.size]}>
        <Tag size="sm" tone={kind.tone}>
          {kind.code}
        </Tag>
        <Text role="block" weight="semibold" className="shrink-0">
          {data.name}
        </Text>
        <Text role="cell" weight="medium" tone="neutral" truncate>
          {t("members", { count: data.members })}
        </Text>
        <ProblemDot problems={data.problems} />
      </Toolbar>
      <NodeHandles specs={nodeHandleSpecs(data.ports, data.reversed)} />
    </Surface>
  )
}
