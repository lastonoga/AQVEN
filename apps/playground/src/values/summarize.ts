import { factsOf } from "./detect.js"
import { renderOf, summaryKindOf } from "./format.js"
import { hintOf } from "./hint.js"
import { itemViewOf, missingRequired, typeViewOf } from "./ir-types.js"
import type { SummaryContext } from "./format.js"
import type { ValueSummary } from "./kinds.js"
import type { Ir } from "../api/types.js"

const contextOf = (ir: Ir | null, typeName: string): SummaryContext => {
  const view = typeViewOf(ir, typeName)
  return { view, item: itemViewOf(ir, view) }
}

export const summarize = (value: unknown, typeName: string, ir: Ir | null): ValueSummary => {
  const ctx = contextOf(ir, typeName)
  const facts = factsOf(value, hintOf({ schema: ctx.view.schema }))
  const rendered = renderOf(facts, ctx)
  return {
    kind: summaryKindOf(facts, ctx.view),
    text: rendered.text,
    detail: rendered.detail,
    count: rendered.count,
    typeName: ctx.view.name,
    typeLabel: ctx.view.label,
    missing: missingRequired(value, ctx.view),
    facts,
  }
}
