import { findNode } from "./ir-lookup.js"
import { parseSlot } from "./parse.js"
import { previewOf } from "./preview.js"
import { resolveStatic } from "./static.js"
import { walk } from "./walk.js"
import type { Ir } from "../api/types.js"
import type {
  Ref,
  RefContext,
  RefError,
  RefRoot,
  RunSnapshot,
  ValueResult,
  ValueScope,
} from "./types.js"

type ValueResolver = (ref: Ref, ir: Ir, run: RunSnapshot, context: RefContext) => ValueResult

const fail = (code: RefError["code"], message: string): ValueResult => ({ ok: false, error: { code, message } })

const finish = (ref: Ref, base: unknown, scope: ValueScope, nodeId: string, limit?: number): ValueResult => {
  const value = walk(base, ref.segments)
  if (value === undefined) return fail("no_value", `по пути «${ref.text}» значения нет`)
  return {
    ok: true,
    found: { value, preview: previewOf(value, limit), lifted: ref.lifted, scope, nodeId },
  }
}

const nodeValue: ValueResolver = (ref, ir, run, context) => {
  const known = resolveStatic(ref, ir, context)
  if (!known.ok) return known
  const render = run.renders[ref.node]
  if (render === undefined) return fail("no_render", `узел «${ref.node}» в этом прогоне не исполнялся`)
  return finish(ref, { out: render.output }, "single", ref.node)
}

const inputValue: ValueResolver = (ref, _ir, run) => finish(ref, run.input, "single", "")

const overValue = (ir: Ir, run: RunSnapshot, context: RefContext, owner: string): ValueResult => {
  const node = findNode(ir, owner, context)
  if (node === null) return fail("no_iteration", "неизвестно, внутри какого map взят $item")
  const slot = parseSlot(node["over"])
  if (slot.kind === "const") return { ok: true, found: asFound(slot.value) }
  if (slot.kind === "inline") return { ok: true, found: asFound(slot.value) }
  if (slot.kind === "broken") return { ok: false, error: slot.error }
  return resolveValue(slot.ref, ir, run, { component: context.component })
}

const asFound = (value: unknown) => ({
  value,
  preview: previewOf(value),
  lifted: false,
  scope: "single" as ValueScope,
  nodeId: "",
})

const ranCount = (run: RunSnapshot, owner: string, total: number): number => {
  const render = run.renders[owner]
  if (render === undefined) return total
  if (!Array.isArray(render.output)) return total
  return Math.min(total, render.output.length)
}

const itemValue: ValueResolver = (ref, ir, run, context) => {
  const owner = context.nodeId ?? ""
  const source = overValue(ir, run, context, owner)
  if (!source.ok) return source
  if (!Array.isArray(source.found.value))
    return fail("no_value", `коллекция узла «${owner}» в этом прогоне не массив`)
  const items = source.found.value.slice(0, ranCount(run, owner, source.found.value.length))
  const index = context.index
  if (index === undefined) return finish(ref, items, "iterations", owner)
  if (index < 0 || index >= items.length)
    return fail("no_iteration", `итерации №${index + 1} в этом прогоне не было`)
  return finish(ref, items[index], "single", owner)
}

const loopValue: ValueResolver = (ref) =>
  fail("unsupported_root", `«${ref.text}» живёт только внутри цикла — в записи прогона его нет`)

const RESOLVERS: Record<RefRoot, ValueResolver> = {
  node: nodeValue,
  input: inputValue,
  item: itemValue,
  acc: loopValue,
  iter: loopValue,
}

export const resolveValue = (
  ref: Ref,
  ir: Ir,
  run: RunSnapshot | null,
  context: RefContext = {},
): ValueResult => {
  if (run === null) return fail("no_run", "прогон не открыт — фактического значения нет")
  return RESOLVERS[ref.root](ref, ir, run, context)
}
