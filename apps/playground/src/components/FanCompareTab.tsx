import { FanCompare } from "./FanCompare.js"
import { isFanNode } from "./fan-model.js"
import type { InspectorContext } from "./inspector-context.js"

export const fanTabLabel = "Ветки"

export const fanTabVisible = (context: InspectorContext): boolean => isFanNode(context.body)

export function FanCompareTab(context: InspectorContext) {
  return (
    <FanCompare
      nodeId={context.nodeId}
      body={context.body}
      ir={context.ir}
      onSelectNode={context.onSelectNode}
    />
  )
}
