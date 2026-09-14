import { useState } from "react"
import { InspectorSection } from "./InspectorSection.js"
import { JsonView } from "./JsonView.js"
import type { InspectorContext } from "./inspector-context.js"

const copyLabels: Record<string, string> = { idle: "копировать", done: "скопировано" }

export function NodeSourceTab(context: InspectorContext) {
  const [state, setState] = useState<"idle" | "done">("idle")
  const text = JSON.stringify(context.body, null, 2)
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => setState("done"))
  }
  return (
    <InspectorSection title={`ir · nodes.${context.nodeId}`}>
      <div className="mb-1.5 flex justify-end">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:border-slate-700 hover:text-slate-200"
        >
          {copyLabels[state]}
        </button>
      </div>
      <JsonView value={context.body} />
    </InspectorSection>
  )
}
