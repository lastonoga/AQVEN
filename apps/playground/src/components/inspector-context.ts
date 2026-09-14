import type { Ir, IrNode } from "../api/index.js"
import type { RunSnapshot } from "../refs/index.js"

export type InspectorContext = {
  nodeId: string
  body: IrNode
  ir: Ir | null
  known: ReadonlySet<string>
  step: number
  total: number
  run: RunSnapshot | null
  onSelectNode: (nodeId: string) => void
}
