import { useMemo } from "react"
import { RunTable } from "../components/RunTable.js"
import { RunStepDetail } from "../components/RunStepDetail.js"
import { FanCompare } from "../components/FanCompare.js"
import { buildSteps, stepSnapshot } from "../components/run-steps.js"
import { isFanNode } from "../components/fan-model.js"
import { findNode } from "../refs/index.js"
import { registerRunPanel } from "./slots.js"
import type { RunPanelProps } from "./slots.js"
import type { IrNode } from "../api/index.js"
import type { RunStep } from "../components/run-steps.js"

const HINT = "p-3 font-mono text-[12px] text-slate-600"

const bodyOf = ({ ir, nodeId }: RunPanelProps): IrNode | null => (nodeId === null ? null : findNode(ir, nodeId))

const useSteps = ({ selection }: RunPanelProps): readonly RunStep[] => {
  const view = selection.view
  const renders = selection.renders
  return useMemo(() => (view === null ? [] : buildSteps(view, renders)), [view, renders])
}

function StepsPanel(props: RunPanelProps) {
  const { selection, nodeId, onSelectNode } = props
  const view = selection.view
  if (view === null) return <p className={HINT}>прогон ещё не загрузился</p>
  return (
    <RunTable
      view={view}
      run={selection.run}
      renders={selection.renders}
      selectedId={nodeId}
      onSelectNode={onSelectNode}
    />
  )
}

function DetailPanel(props: RunPanelProps) {
  const { ir, selection, nodeId, onSelectNode } = props
  const steps = useSteps(props)
  const snapshot = useMemo(() => stepSnapshot(selection.run, selection.renders), [selection.run, selection.renders])
  if (nodeId === null) return <p className={HINT}>выберите шаг в таблице или узел на канвасе</p>
  const step = steps.find((item) => item.nodeId === nodeId)
  if (step === undefined) return <p className={HINT}>узел {nodeId} в этом прогоне не выполнялся</p>
  return <RunStepDetail step={step} ir={ir} run={snapshot} onSelectNode={onSelectNode} />
}

function ComparePanel(props: RunPanelProps) {
  const { ir, nodeId, onSelectNode } = props
  const body = bodyOf(props)
  if (nodeId === null || body === null) return <p className={HINT}>выберите веерный узел</p>
  return <FanCompare nodeId={nodeId} body={body} ir={ir} onSelectNode={onSelectNode} />
}

export const installRunPanels = (): void => {
  registerRunPanel("steps", { title: "шаги", Component: StepsPanel, appliesTo: () => true })
  registerRunPanel("detail", { title: "шаг", Component: DetailPanel, appliesTo: () => true })
  registerRunPanel("compare", {
    title: "ветки",
    Component: ComparePanel,
    appliesTo: (props) => isFanNode(bodyOf(props)),
  })
}
