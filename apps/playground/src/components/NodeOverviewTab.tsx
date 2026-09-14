import type { ReactNode } from "react"
import { kindStyle } from "../graph/kinds.js"
import { InspectorSection } from "./InspectorSection.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { SlotSourceView } from "./SlotSourceView.js"
import { flattenParams, labelOf } from "./node-labels.js"
import { caseSlots } from "./node-slots.js"
import { isRecord, outTypeName } from "./ir-value.js"
import type { InspectorContext } from "./inspector-context.js"
import type { IrNode } from "../api/index.js"

const HIDDEN_ALWAYS = ["kind", "description", "in", "out", "do", "cases", "over", "on", "params"]

const hiddenByKind: Record<string, readonly string[]> = {
  llm: ["overrides", "outputContract", "allowedSets"],
}

const hiddenFor = (kind: string): ReadonlySet<string> =>
  new Set([...HIDDEN_ALWAYS, ...(hiddenByKind[kind] ?? [])])

const describe = (body: IrNode): string =>
  typeof body["description"] === "string" ? body["description"] : ""

const nestedSummary = (body: IrNode): string => {
  const inner = body["do"]
  if (!isRecord(inner)) return ""
  const kind = typeof inner["kind"] === "string" ? inner["kind"] : ""
  const name = ["fn", "tool", "component"].map((key) => inner[key]).find((value) => typeof value === "string")
  return [kindStyle(kind).title, typeof name === "string" ? name : ""].filter((part) => part !== "").join(" · ")
}

function BranchSection(context: InspectorContext) {
  const cases = caseSlots(context.body, context.known)
  if (cases.length === 0) return null
  const fallback = context.body["default"]
  return (
    <InspectorSection title="ветви">
      <div className="font-mono text-[11.5px]">
        {cases.map((branch) => (
          <div key={branch.name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 py-0.5">
            <span className="truncate text-orange-300">{branch.name}</span>
            <span className="min-w-0 break-words">
              <SlotSourceView source={branch.source} known={context.known} onSelectNode={context.onSelectNode} />
            </span>
          </div>
        ))}
        {"default" in context.body && (
          <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 py-0.5">
            <span className="truncate text-slate-500">по умолчанию</span>
            <span className="text-slate-400">{fallback === null ? "нет" : JSON.stringify(fallback)}</span>
          </div>
        )}
      </div>
    </InspectorSection>
  )
}

function BodySection(context: InspectorContext) {
  const inner = context.body["do"]
  if (!isRecord(inner)) return null
  return (
    <InspectorSection title="тело перебора">
      <KeyValueRows
        rows={[
          { label: "Что выполняется", value: nestedSummary(context.body) },
          { label: labelOf("modelRole"), value: typeof inner["modelRole"] === "string" ? inner["modelRole"] : "" },
        ]}
      />
    </InspectorSection>
  )
}

function ParamsSection(context: InspectorContext) {
  const params = context.body["params"]
  if (!isRecord(params)) return null
  const rows = flattenParams(params, new Set())
  if (rows.length === 0) return null
  return (
    <InspectorSection title="параметры компонента">
      <KeyValueRows rows={rows.map((row) => ({ label: row.label, value: row.value }))} />
    </InspectorSection>
  )
}

const extraSections: Record<string, (context: InspectorContext) => ReactNode> = {
  switch: BranchSection,
  map: BodySection,
  loop: BodySection,
  call: ParamsSection,
}

export function NodeOverviewTab(context: InspectorContext) {
  const style = kindStyle(context.body.kind)
  const description = describe(context.body)
  const params = flattenParams(context.body, hiddenFor(context.body.kind))
  const Extra = extraSections[context.body.kind]
  return (
    <>
      <InspectorSection title="узел">
        <KeyValueRows
          rows={[
            { label: "Имя", value: context.nodeId },
            { label: "Вид", value: `${style.title} (${style.label})` },
            {
              label: "Описание",
              value: description === "" ? "" : <span className="font-sans text-slate-300">{description}</span>,
            },
            { label: "Шаг", value: context.step === 0 ? "" : `${context.step} из ${context.total}` },
            { label: "Тип выхода", value: outTypeName(context.body) },
          ]}
        />
      </InspectorSection>
      {params.length > 0 && (
        <InspectorSection title="параметры">
          <KeyValueRows rows={params.map((row) => ({ label: row.label, value: row.value }))} />
        </InspectorSection>
      )}
      {Extra !== undefined && <Extra {...context} />}
    </>
  )
}
