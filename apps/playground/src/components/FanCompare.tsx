import { Fragment, useMemo, useState } from "react"
import { BranchCell, BranchHeader } from "./BranchColumn.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { ValueView } from "./ValueView.js"
import { FAN_COLUMNS, MAX_COLUMNS, fanOf, fanRows, range } from "./fan-model.js"
import { promptParts } from "./prompt-diff.js"
import { useRunSnapshot } from "./run-context.js"
import { useRunSelection } from "../run-context.js"
import type { ReactNode } from "react"
import type { Ir, IrNode } from "../api/index.js"
import type { RunSnapshot } from "../refs/index.js"
import type { RunSelection } from "../run-context.js"
import type { FanFacts, FanModel, FanRender } from "./fan-model.js"

type Props = {
  nodeId: string
  body: IrNode
  ir?: Ir | null
  onSelectNode?: (nodeId: string) => void
}

const LABEL_WIDTH = "9.5rem"
const WIDE_COLUMN = "18rem"
const FIT_COLUMN = "minmax(15rem, 1fr)"

const columnsOf = (count: number): string => {
  const column = count > FAN_COLUMNS ? WIDE_COLUMN : FIT_COLUMN
  return `${LABEL_WIDTH} repeat(${count}, ${column})`
}

const snapshotOf = (selection: RunSelection): RunSnapshot | null => {
  if (selection.run === null) return null
  return { input: selection.run.input, renders: selection.renders }
}

const rendersOf = (selection: RunSelection, snapshot: RunSnapshot | null): Readonly<Record<string, FanRender>> => {
  if (Object.keys(selection.renders).length > 0) return selection.renders
  return snapshot?.renders ?? {}
}

const useFanFacts = (): FanFacts => {
  const selection = useRunSelection()
  const provided = useRunSnapshot()
  return useMemo(() => {
    const snapshot = provided ?? snapshotOf(selection)
    return { nodes: selection.nodes, renders: rendersOf(selection, snapshot), snapshot }
  }, [selection, provided])
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-slate-500">{children}</p>
}

function Shared({ model }: { model: FanModel }) {
  const rows = model.common.map((fact) => ({ label: fact.label, value: fact.value }))
  if (rows.length === 0 && model.sharedInput === null && model.sharedPrompt === null) return null
  return (
    <div className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/40 px-2.5 py-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">общее для всех веток</span>
      <KeyValueRows rows={rows} />
      {model.sharedInput !== null && (
        <div className="flex flex-col gap-1 border-t border-slate-800 pt-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">вход · один на все</span>
          <ValueView value={model.sharedInput.value} />
        </div>
      )}
      {model.sharedPrompt !== null && (
        <div className="flex flex-col gap-1 border-t border-slate-800 pt-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">промт · один на все</span>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-900/60 p-1.5 font-mono text-[11px] leading-relaxed text-slate-400">
            {model.sharedPrompt}
          </pre>
        </div>
      )}
    </div>
  )
}

type PickerProps = { model: FanModel; onPick: (picked: readonly number[]) => void }

const withIndex = (picked: readonly number[], index: number): number[] =>
  [...new Set([...picked, index])].sort((a, b) => a - b).slice(0, MAX_COLUMNS)

const withoutIndex = (picked: readonly number[], index: number): number[] =>
  picked.filter((item) => item !== index)

function IterationPicker({ model, onPick }: PickerProps) {
  const [draft, setDraft] = useState("")
  const hidden = model.total - model.picked.length
  const chosen = Number(draft) - 1

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[11px] text-slate-500">
        итераций {model.total} · показано {model.picked.length}
        {hidden > 0 ? ` · ещё ${hidden}` : ""}
      </span>
      {model.picked.map((index) => (
        <button
          key={index}
          type="button"
          onClick={() => onPick(withoutIndex(model.picked, index))}
          disabled={model.picked.length === 1}
          title="убрать колонку"
          className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
        >
          {index + 1} ✕
        </button>
      ))}
      {hidden > 0 && (
        <span className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            inputMode="numeric"
            placeholder="№"
            className="w-14 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 outline-none focus:border-sky-600"
          />
          <button
            type="button"
            onClick={() => onPick(withIndex(model.picked, chosen))}
            disabled={!Number.isInteger(chosen) || chosen < 0 || chosen >= model.total}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            показать
          </button>
          <button
            type="button"
            onClick={() => onPick(range(Math.min(model.total, FAN_COLUMNS)))}
            className="rounded px-1.5 py-0.5 font-mono text-[11px] text-slate-500 hover:text-slate-300"
          >
            первые {Math.min(model.total, FAN_COLUMNS)}
          </button>
        </span>
      )}
    </div>
  )
}

function Grid({ model, onSelectNode }: { model: FanModel; onSelectNode?: (nodeId: string) => void }) {
  const rows = fanRows(model)
  const parts = promptParts(model.branches.map((branch) => branch.prompt))
  if (model.branches.length === 0) {
    return (
      <Note>веер в этом прогоне не разворачивался: ни одной ветки, сравнивать нечего</Note>
    )
  }
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-full" style={{ gridTemplateColumns: columnsOf(model.branches.length) }}>
        <div className="sticky left-0 z-10 border-b border-slate-800 bg-slate-950 px-2 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600">срез</span>
        </div>
        {model.branches.map((branch) => (
          <div key={branch.key} className="border-b border-slate-800">
            <BranchHeader branch={branch} onSelectNode={onSelectNode} />
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.id}>
            <div className="sticky left-0 z-10 border-b border-slate-800/70 bg-slate-950 px-2 py-1.5">
              <span className="text-[11.5px] text-slate-500">{row.label}</span>
            </div>
            {model.branches.map((branch, column) => (
              <div key={branch.key} className="min-w-0 border-b border-slate-800/70">
                <BranchCell
                  row={row}
                  branch={branch}
                  parts={parts[column] ?? []}
                  onSelectNode={onSelectNode}
                />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export function FanCompare({ nodeId, body, ir = null, onSelectNode }: Props) {
  const facts = useFanFacts()
  const [picked, setPicked] = useState<readonly number[] | undefined>(undefined)
  const model = useMemo(
    () => fanOf({ nodeId, body, ir, facts, picked }),
    [nodeId, body, ir, facts, picked],
  )

  if (model === null) return null

  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">{model.title}</span>
        <span className="font-mono text-[11px] text-slate-400">{nodeId}</span>
        <span className="font-mono text-[11px] text-slate-600">веток {model.total}</span>
      </div>
      {model.kind === "map" && model.total > model.picked.length && (
        <IterationPicker model={model} onPick={setPicked} />
      )}
      <Shared model={model} />
      <Grid model={model} onSelectNode={onSelectNode} />
      {facts.snapshot === null && <Note>прогон не выбран: показаны только различия схемы, значений нет</Note>}
      {model.notes.map((note) => (
        <Note key={note}>{note}</Note>
      ))}
    </div>
  )
}
