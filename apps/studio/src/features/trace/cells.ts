import type { CallColumn, RowKey } from "@/domain"
import type { CellBlock } from "@/components/studio"
import { agentCells, modelCells } from "./agent-cells"
import { checkCells } from "./check-cells"
import type { TraceContext } from "./context"
import { callCells, columnsCells } from "./head-cells"
import { inputCells, outputCells, promptCells } from "./io-cells"

export type RowCells = (column: CallColumn, ctx: TraceContext) => readonly CellBlock[]

export const ROW_CELLS: Readonly<Record<RowKey, RowCells>> = {
  columns: columnsCells,
  call: callCells,
  agent: agentCells,
  model: modelCells,
  input: inputCells,
  prompt: promptCells,
  output: outputCells,
  postCheck: checkCells,
  assertions: checkCells,
}
