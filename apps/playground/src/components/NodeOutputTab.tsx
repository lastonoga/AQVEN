import { InspectorHint, InspectorSection } from "./InspectorSection.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { TypeBadge } from "./TypeBadge.js"
import { RunValueView } from "./ValueView.js"
import { consumersOf } from "./output-consumers.js"
import { outTypeName } from "./ir-value.js"
import { recordedOutput } from "../refs/index.js"
import type { RefValue } from "../refs/index.js"
import type { InspectorContext } from "./inspector-context.js"

const reasonOf = (run: unknown): string =>
  run === null ? "прогон не открыт — фактического значения нет" : "в этом прогоне узел не исполнялся"

const foundOf = (context: InspectorContext): RefValue | null => {
  const recorded = recordedOutput(context.run, context.nodeId)
  if (recorded === null) return null
  return { value: recorded.value, preview: recorded.preview, lifted: false, scope: "single", nodeId: context.nodeId }
}

export function NodeOutputTab(context: InspectorContext) {
  const typeName = outTypeName(context.body)
  const consumers = consumersOf(context.ir, context.nodeId)

  return (
    <>
      <InspectorSection title="выход узла">
        <KeyValueRows
          rows={[
            {
              label: "Тип значения",
              value: <TypeBadge type={typeName} ir={context.ir} missing="тип выхода не объявлен" />,
            },
            { label: "Ссылка", value: <span className="text-sky-300">{`$${context.nodeId}.out`}</span> },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="значение в прогоне">
        <RunValueView found={foundOf(context)} reason={reasonOf(context.run)} />
      </InspectorSection>
      <InspectorSection title="кто читает этот выход">
        {consumers.length === 0 ? (
          <InspectorHint>Ни один слот не ссылается на этот узел.</InspectorHint>
        ) : (
          <div className="font-mono text-[11.5px]">
            {consumers.map((consumer) => (
              <div
                key={`${consumer.node}.${consumer.slot}`}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-x-2 border-b border-slate-900 py-1 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => context.onSelectNode(consumer.node)}
                  className="truncate text-left text-sky-400 hover:text-sky-300 hover:underline"
                  title="выделить узел на схеме"
                >
                  {consumer.node}
                </button>
                <span className="min-w-0 truncate text-slate-400" title={`${consumer.slot} ← ${consumer.path}`}>
                  <span className="text-slate-200">{consumer.slot}</span>
                  <span className="text-slate-600"> ← {consumer.path}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </InspectorSection>
    </>
  )
}
