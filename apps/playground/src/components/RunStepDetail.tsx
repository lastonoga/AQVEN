import { RefChip } from "./RefChip.js"
import { TypeBadge } from "./TypeBadge.js"
import { ValueView } from "./ValueView.js"
import { formatTokens, formatUsd, stepSlots } from "./run-steps.js"
import { formatClock, formatMs } from "../run/styles.js"
import type { RunStep, StepCheck, StepSlot } from "./run-steps.js"
import type { Ir } from "../api/index.js"
import type { RunSnapshot } from "../refs/index.js"
import type { ReactNode } from "react"

type Props = {
  step: RunStep
  ir: Ir | null
  run: RunSnapshot | null
  onSelectNode: (nodeId: string) => void
}

const PANEL = "flex min-w-0 flex-col rounded border border-slate-800 bg-slate-950/70"

const HEAD = "border-b border-slate-800 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500"

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={PANEL}>
      <h4 className={HEAD}>
        {title}
        {hint !== undefined && <span className="ml-1.5 normal-case tracking-normal text-slate-600">{hint}</span>}
      </h4>
      <div className="min-w-0 px-2 py-1.5">{children}</div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="font-mono text-[11.5px] text-slate-600">{text}</p>
}

function SlotRow({ slot, ir, onSelectNode }: { slot: StepSlot; ir: Ir | null; onSelectNode: (id: string) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-start gap-x-2 border-b border-slate-900 py-1 last:border-b-0">
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="truncate font-mono text-[11.5px] text-slate-200" title={slot.name}>
          {slot.name}
        </span>
        {slot.type !== "" && <TypeBadge type={slot.type} ir={ir} />}
        {slot.provenance !== null && (
          <RefChip provenance={slot.provenance} raw={slot.raw} onSelectNode={onSelectNode} />
        )}
      </span>
      <span className="min-w-0">
        {slot.known ? <ValueView value={slot.value} depth={1} /> : <Empty text="значения нет" />}
      </span>
    </div>
  )
}

function InputPanel({ step, ir, run, onSelectNode }: Props) {
  const slots = stepSlots(step, ir, run)
  if (slots.length === 0)
    return (
      <Panel title="вход">
        {step.input === undefined ? <Empty text="вход не записан" /> : <ValueView value={step.input} depth={1} />}
      </Panel>
    )
  return (
    <Panel title="вход" hint={`слотов: ${slots.length}`}>
      {slots.map((slot) => (
        <SlotRow key={slot.name} slot={slot} ir={ir} onSelectNode={onSelectNode} />
      ))}
    </Panel>
  )
}

function OutputPanel({ step, ir }: { step: RunStep; ir: Ir | null }) {
  if (step.error !== null)
    return (
      <Panel title="выход">
        <p className="rounded border border-red-900/60 bg-red-950/20 px-2 py-1 text-[12px] text-red-300">{step.error}</p>
      </Panel>
    )
  return (
    <Panel title={step.prompt === null ? "выход" : "распарсенный выход"}>
      <div className="flex min-w-0 flex-col gap-1">
        {step.outputType !== null && <TypeBadge type={step.outputType} ir={ir} />}
        {step.output === undefined ? <Empty text="выхода ещё нет" /> : <ValueView value={step.output} depth={1} />}
      </div>
    </Panel>
  )
}

function TextPanel({ title, hint, text }: { title: string; hint?: string; text: string | null }) {
  if (text === null) return null
  return (
    <Panel title={title} hint={hint}>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-slate-300">
        {text}
      </pre>
    </Panel>
  )
}

const checkTones: Record<string, string> = {
  true: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  false: "bg-red-950 text-red-300 ring-red-800",
  null: "bg-slate-900 text-slate-400 ring-slate-700",
}

const checkLabels: Record<string, string> = { true: "прошла", false: "не прошла", null: "нет вердикта" }

function CheckRow({ check }: { check: StepCheck }) {
  const key = String(check.ok)
  return (
    <div className="flex items-start gap-2 border-b border-slate-900 py-1 last:border-b-0">
      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ${checkTones[key] ?? ""}`}>
        {checkLabels[key] ?? ""}
      </span>
      <span className="min-w-0 font-mono text-[11.5px] text-slate-200">{check.name}</span>
      {check.message !== "" && <span className="min-w-0 flex-1 text-[11.5px] text-slate-400">{check.message}</span>}
    </div>
  )
}

function ChecksPanel({ checks }: { checks: readonly StepCheck[] }) {
  if (checks.length === 0) return null
  return (
    <Panel title="проверки" hint={`${checks.length}`}>
      {checks.map((check) => (
        <CheckRow key={check.name} check={check} />
      ))}
    </Panel>
  )
}

function NotesPanel({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null
  return (
    <section className="rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5">
      <h4 className="font-mono text-[10px] uppercase tracking-[0.08em] text-amber-500">
        упрощения исполнителя · {items.length}
      </h4>
      <ul className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className="text-[11.5px] leading-relaxed text-amber-200">
            · {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

type Cell = { label: string; value: string; title: string }

const NO_METRIC = "исполнитель этого не сообщает — вызовов моделей не было"

const cellsOf = (step: RunStep): Cell[] => [
  { label: "старт", value: formatClock(step.startedAt), title: "" },
  { label: "длительность", value: formatMs(step.durationMs), title: "" },
  { label: "токены входа", value: formatTokens(step.metrics.inputTokens), title: NO_METRIC },
  { label: "токены выхода", value: formatTokens(step.metrics.outputTokens), title: NO_METRIC },
  { label: "токены всего", value: formatTokens(step.metrics.totalTokens), title: NO_METRIC },
  { label: "стоимость", value: formatUsd(step.metrics.costUsd), title: NO_METRIC },
]

function Metrics({ step }: { step: RunStep }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {cellsOf(step).map((cell) => (
        <span key={cell.label} className="font-mono text-[11px] text-slate-500" title={cell.title}>
          {cell.label} <span className="text-slate-300">{cell.value}</span>
        </span>
      ))}
    </div>
  )
}

export function RunStepDetail({ step, ir, run, onSelectNode }: Props) {
  return (
    <div className="flex flex-col gap-2 border-l-2 border-slate-700 bg-slate-950/40 px-3 py-2">
      <Metrics step={step} />
      <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
        <InputPanel step={step} ir={ir} run={run} onSelectNode={onSelectNode} />
        <OutputPanel step={step} ir={ir} />
      </div>
      <TextPanel title="отрисованный промт" hint={`${step.kind}`} text={step.prompt} />
      <TextPanel title="сырой ответ" text={step.rawResponse} />
      <ChecksPanel checks={step.checks} />
      <NotesPanel items={step.simplifications} />
    </div>
  )
}
