import { PORT_HANDLES } from "./handles"
import { NodeHandles } from "./node-handles"

export function AnchorNode() {
  return (
    <div className="size-px">
      <NodeHandles specs={PORT_HANDLES} />
    </div>
  )
}
