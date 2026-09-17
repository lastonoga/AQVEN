import { createTranslator } from "use-intl"
import type { CallId, CallSheetTab, ColumnPath, MatrixGroup, StageRun } from "@/domain"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { CLOSED_PATHS, type OpenPaths } from "@/lib/search"
import type { Translator } from "@/i18n/translator"
import { dataflowRuns } from "@/mocks/data/dataflow"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { rowTraces } from "@/mocks/data/test-detail"
import { groupContext, type TraceContext, type TraceScope, type TraceVariant } from "./context"

export type OpenedCall = { readonly callId: CallId; readonly tab: CallSheetTab }

export const traceT: Translator = createTranslator({ locale: "en", messages: messages.en, formats })

export const openPaths = (paths: readonly string[]): OpenPaths => ({
  isOpen: (path: ColumnPath) => paths.includes(path),
  toggle: () => undefined,
})

export const traceScope = (variant: TraceVariant, open: OpenPaths = CLOSED_PATHS, calls: OpenedCall[] = []): TraceScope => ({
  t: traceT,
  variant,
  open,
  onOpenCall: (callId, tab) => {
    calls.push({ callId, tab })
  },
})

export const traceContext = (group: MatrixGroup, variant: TraceVariant = "run", depth = 1, open: OpenPaths = CLOSED_PATHS): TraceContext =>
  groupContext(traceScope(variant, open), group, group.id, depth)

const DESIGN_RUN = "8247"
const DESIGN_TEST = "pitch_gen_b"
const DESIGN_ROW = "07"

const missing = (what: string): Error => new Error(`mock backend has no ${what}`)

const designRunStages = (): readonly StageRun[] => {
  const run = dataflowRuns[workflowKey(WORKFLOWS.pitchPipeline, DESIGN_RUN)]
  if (run === undefined) throw missing(`run ${DESIGN_RUN}`)
  return run.stages
}

const designRowStages = (): readonly StageRun[] => {
  const trace = rowTraces[workflowKey(WORKFLOWS.pitchPipeline, DESIGN_TEST, DESIGN_ROW)]
  if (trace === undefined) throw missing(`trace ${DESIGN_TEST}/${DESIGN_ROW}`)
  return trace.steps
}

const stageById = (stages: readonly StageRun[], id: string): StageRun => {
  const stage = stages.find((entry) => entry.id === id)
  if (stage === undefined) throw missing(`stage ${id}`)
  return stage
}

const groupById = (stage: StageRun, id: string): MatrixGroup => {
  const group = stage.groups.find((entry) => entry.id === id)
  if (group === undefined) throw missing(`group ${id}`)
  return group
}

export const ROW_07_STAGES: readonly StageRun[] = designRowStages()
export const DIVERGE_STAGE: StageRun = stageById(ROW_07_STAGES, "pitch_divergence")
export const LOOP_STAGE: StageRun = stageById(ROW_07_STAGES, "critic_loop")
export const MAP_STAGE: StageRun = stageById(designRunStages(), "hotel_scoring")
export const LOAD_STAGE: StageRun = stageById(designRunStages(), "data_load")
export const PERSONA_GROUP: MatrixGroup = groupById(stageById(designRunStages(), "pitch_decision"), "personas")
