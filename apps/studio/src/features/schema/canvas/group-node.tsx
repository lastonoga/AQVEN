import type { NodeProps } from "@xyflow/react"
import { ContainerView } from "./container-view"
import { containerHandles } from "./handles"
import { NodeHandles } from "./node-handles"
import type { ContainerFlowNode } from "./to-flow"

function ContainerHandles({ flowY }: { readonly flowY: number | null }) {
  if (flowY === null) return null
  return <NodeHandles specs={containerHandles(flowY)} />
}

export function GroupNode({ data }: NodeProps<ContainerFlowNode>) {
  return (
    <>
      <ContainerView data={data} />
      <ContainerHandles flowY={data.flowY} />
    </>
  )
}
