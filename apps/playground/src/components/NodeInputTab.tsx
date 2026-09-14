import { InspectorHint, InspectorSection } from "./InspectorSection.js"
import { RefChip } from "./RefChip.js"
import { ValuePopover } from "./ValuePopover.js"
import { ValuePreview, ValueView } from "./ValueView.js"
import { embeddedLlm } from "./ir-value.js"
import type { Slot } from "./ir-value.js"
import { nodeSlots } from "./node-slots.js"
import { resolveSlot } from "../refs/index.js"
import type { RefErrorCode, SlotProvenance } from "../refs/index.js"
import type { InspectorContext } from "./inspector-context.js"
import type { Ir } from "../api/index.js"

type TableProps = { slots: readonly Slot[]; context: InspectorContext; ir: Ir; owner: string }

const GRID = "grid grid-cols-[minmax(0,4.5rem)_minmax(0,1.5fr)_minmax(0,1fr)] gap-x-2"

const gapLabels: Record<RefErrorCode, string> = {
  not_a_ref: "—",
  empty_root: "—",
  bad_segment: "—",
  unknown_node: "узел не найден",
  no_run: "—",
  no_render: "не исполнялся",
  no_value: "нет значения",
  no_iteration: "нет итерации",
  unsupported_root: "только в цикле",
}

function SlotValueCell({ provenance }: { provenance: SlotProvenance }) {
  if (provenance.value === null) {
    const code = provenance.valueError?.code ?? "no_value"
    return (
      <span className="font-mono text-[11px] text-slate-700" title={provenance.valueError?.message}>
        {gapLabels[code]}
      </span>
    )
  }
  return (
    <ValuePopover content={<ValueView value={provenance.value.value} />}>
      <span className="min-w-0 cursor-help rounded px-0.5 hover:bg-slate-800/70">
        <ValuePreview value={provenance.value.value} />
      </span>
    </ValuePopover>
  )
}

function SlotRow({ slot, context, ir, owner }: { slot: Slot } & Omit<TableProps, "slots">) {
  const provenance = resolveSlot(slot.name, slot.raw, ir, context.run, { nodeId: owner })
  return (
    <div className={`${GRID} items-start border-b border-slate-900 py-1 last:border-b-0`}>
      <span className="truncate pt-[2px] text-slate-200" title={slot.name}>
        {slot.name}
      </span>
      <span className="min-w-0">
        <RefChip provenance={provenance} raw={slot.raw} onSelectNode={context.onSelectNode} />
      </span>
      <span className="min-w-0 pt-[2px]">
        <SlotValueCell provenance={provenance} />
      </span>
    </div>
  )
}

function SlotTable({ slots, context, ir, owner }: TableProps) {
  return (
    <div className="font-mono text-[11.5px]">
      <div className={`${GRID} border-b border-slate-800 pb-1 text-[10px] uppercase tracking-[0.08em] text-slate-500`}>
        <span>слот</span>
        <span>источник</span>
        <span>значение</span>
      </div>
      {slots.map((slot) => (
        <SlotRow key={slot.name} slot={slot} context={context} ir={ir} owner={owner} />
      ))}
    </div>
  )
}

const hints: Record<"run" | "flow", string> = {
  run: "Наведите на ссылку — полный путь, узел-источник и значение из прогона. Клик выделяет источник на схеме.",
  flow: "Наведите на ссылку — полный путь, узел-источник и тип. Значения появятся, когда открыт прогон.",
}

export function NodeInputTab(context: InspectorContext) {
  const slots = nodeSlots(context.body, context.known)
  const nested = embeddedLlm(context.body)
  const nestedSlots = nested === null || !nested.nested ? [] : nodeSlots(nested.body, context.known)

  if (context.ir === null) {
    return (
      <InspectorSection title="вход">
        <InspectorHint>IR воркфлоу не загружен — источники слотов не разобрать.</InspectorHint>
      </InspectorSection>
    )
  }

  if (slots.length === 0 && nestedSlots.length === 0) {
    return (
      <InspectorSection title="вход">
        <InspectorHint>У узла нет входных слотов.</InspectorHint>
      </InspectorSection>
    )
  }

  return (
    <>
      {slots.length > 0 && (
        <InspectorSection title="слоты входа">
          <SlotTable slots={slots} context={context} ir={context.ir} owner={context.nodeId} />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-600">
            {hints[context.run === null ? "flow" : "run"]}
          </p>
        </InspectorSection>
      )}
      {nestedSlots.length > 0 && (
        <InspectorSection title="вход вложенного узла">
          <SlotTable slots={nestedSlots} context={context} ir={context.ir} owner={context.nodeId} />
        </InspectorSection>
      )}
    </>
  )
}
