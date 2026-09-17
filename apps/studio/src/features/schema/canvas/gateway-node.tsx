import type { NodeProps } from "@xyflow/react"
import { GATEWAY, Marker, Rich } from "@/components/studio"
import { PORT_HANDLES } from "./handles"
import { NodeHandles } from "./node-handles"
import type { GatewayFlowNode } from "./to-flow"

export function GatewayNode({ data }: NodeProps<GatewayFlowNode>) {
  const gateway = GATEWAY[data.mode]
  return (
    <div className="flex size-11">
      <Marker shape="diamond" size="canvas" tone={gateway.tone}>
        <Rich value={{ text: gateway.glyph, tone: gateway.tone }} />
      </Marker>
      <NodeHandles specs={PORT_HANDLES} />
    </div>
  )
}
