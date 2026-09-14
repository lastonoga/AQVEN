import { InspectorHint, InspectorNotice, InspectorSection } from "./InspectorSection.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { SlotSourceView } from "./SlotSourceView.js"
import { embeddedLlm, isRecord, parseSlotValue } from "./ir-value.js"
import { flattenParams, formatParamValue, labelOf } from "./node-labels.js"
import type { InspectorContext } from "./inspector-context.js"

type SetEntry = { type: string; from: unknown }

const allowedSetsOf = (body: Record<string, unknown>): SetEntry[] => {
  const sets = body["allowedSets"]
  if (!Array.isArray(sets)) return []
  return sets.filter(isRecord).map((entry) => ({
    type: typeof entry["type"] === "string" ? entry["type"] : "",
    from: entry["from"],
  }))
}

function RecordSection({ title, value }: { title: string; value: unknown }) {
  if (!isRecord(value)) return null
  const rows = flattenParams(value, new Set())
  if (rows.length === 0) return null
  return (
    <InspectorSection title={title}>
      <KeyValueRows rows={rows.map((row) => ({ label: row.label, value: row.value }))} />
    </InspectorSection>
  )
}

const textOf = (body: Record<string, unknown>, key: string): string =>
  typeof body[key] === "string" ? formatParamValue(key, body[key]) : ""

export function NodePromptTab(context: InspectorContext) {
  const llm = embeddedLlm(context.body)
  if (llm === null) return null
  const body = llm.body
  const sets = allowedSetsOf(body)
  return (
    <>
      <InspectorSection title="модель">
        <KeyValueRows
          rows={[
            { label: "Промт-функция", value: textOf(body, "fn") },
            { label: labelOf("modelRole"), value: textOf(body, "modelRole") },
            { label: labelOf("trustIn"), value: textOf(body, "trustIn") },
          ]}
        />
        {llm.nested && (
          <div className="mt-1.5">
            <InspectorHint>Параметры вложенного узла: {context.nodeId}.do</InspectorHint>
          </div>
        )}
      </InspectorSection>
      <RecordSection title="настройки вывода" value={body["outputContract"]} />
      <RecordSection title="переопределения модели" value={body["overrides"]} />
      {sets.length > 0 && (
        <InspectorSection title="разрешённые множества">
          <div className="font-mono text-[11.5px]">
            {sets.map((entry) => (
              <div key={entry.type} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 py-0.5">
                <span className="truncate text-violet-300">{entry.type}</span>
                <span className="min-w-0 break-words">
                  <SlotSourceView
                    source={parseSlotValue(entry.from, context.known)}
                    known={context.known}
                    onSelectNode={context.onSelectNode}
                  />
                </span>
              </div>
            ))}
          </div>
        </InspectorSection>
      )}
      <InspectorSection title="текст промта">
        <InspectorNotice>
          Промт собирается при прогоне: шаблон, подстановки слотов и системная часть появятся здесь после
          первого запуска узла. Сейчас показано только то, что есть в IR.
        </InspectorNotice>
      </InspectorSection>
    </>
  )
}
