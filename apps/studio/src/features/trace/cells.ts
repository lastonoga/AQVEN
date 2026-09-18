import type { CellBlock } from "@/components/studio"
import { agentCells, modelCells } from "./agent-cells"
import { checkCells } from "./check-cells"
import type { TraceContext } from "./context"
import { callCells } from "./head-cells"
import { inferenceInputCells, inferenceOutputCells, promptCells } from "./io-cells"
import type { CallColumn, RowKey } from "./model"

export type RowCells = (column: CallColumn, ctx: TraceContext) => readonly CellBlock[]

export const ROW_CELLS: Readonly<Record<RowKey, RowCells>> = {
  call: callCells,
  agent: agentCells,
  model: modelCells,
  input: inferenceInputCells,
  prompt: (column, ctx) => promptCells(column.prompt, ctx),
  output: inferenceOutputCells,
  postCheck: (column, ctx) => checkCells(column.check, ctx),
}
