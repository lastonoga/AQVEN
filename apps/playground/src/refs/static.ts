import { descriptionOf, findNode, itemTypeOf, kindOf, outTypeOf } from "./ir-lookup.js"
import { dropOutHead, typeAlong } from "./type-path.js"
import type { Ir } from "../api/types.js"
import type { Ref, RefContext, RefError, RefOrigin, RefRoot, StaticResult } from "./types.js"

type StaticResolver = (ref: Ref, ir: Ir, context: RefContext) => StaticResult

const fail = (code: RefError["code"], message: string): StaticResult => ({ ok: false, error: { code, message } })

const ok = (origin: RefOrigin): StaticResult => ({ ok: true, origin })

const missingNode = (ref: Ref): StaticResult => {
  if (ref.segments.length === 0)
    return fail("unknown_node", `«${ref.text}» — не узел: похоже на параметр компонента`)
  return fail("unknown_node", `узел «${ref.node}» не найден в воркфлоу`)
}

const nodeStatic: StaticResolver = (ref, ir, context) => {
  const node = findNode(ir, ref.node, context)
  if (node === null) return missingNode(ref)
  const rootType = outTypeOf(node)
  return ok({
    root: "node",
    label: `узел ${ref.node}`,
    nodeId: ref.node,
    nodeKind: kindOf(node),
    description: descriptionOf(node),
    rootType,
    type: typeAlong(rootType, dropOutHead(ref.segments)),
    path: ref.path,
  })
}

const inputStatic: StaticResolver = (ref, ir) =>
  ok({
    root: "input",
    label: "вход воркфлоу",
    nodeId: "",
    nodeKind: "",
    description: `входной тип воркфлоу ${ir.flow}`,
    rootType: ir.input,
    type: typeAlong(ir.input, ref.segments),
    path: ref.path,
  })

const itemStatic: StaticResolver = (ref, ir, context) => {
  const owner = context.nodeId ?? ""
  const node = findNode(ir, owner, context)
  const rootType = itemTypeOf(node)
  return ok({
    root: "item",
    label: "элемент коллекции",
    nodeId: owner,
    nodeKind: kindOf(node),
    description: owner === "" ? "текущий элемент map" : `текущий элемент map «${owner}»`,
    rootType,
    type: typeAlong(rootType, ref.segments),
    path: ref.path,
  })
}

const loopStatic = (root: RefRoot, label: string, note: string): StaticResolver => (ref, ir, context) => {
  const owner = context.nodeId ?? ""
  const node = findNode(ir, owner, context)
  return ok({
    root,
    label,
    nodeId: owner,
    nodeKind: kindOf(node),
    description: owner === "" ? note : `${note} узла «${owner}»`,
    rootType: "",
    type: typeAlong("", ref.segments),
    path: ref.path,
  })
}

const RESOLVERS: Record<RefRoot, StaticResolver> = {
  node: nodeStatic,
  input: inputStatic,
  item: itemStatic,
  acc: loopStatic("acc", "аккумулятор цикла", "накопленное значение цикла"),
  iter: loopStatic("iter", "состояние итерации", "состояние текущей итерации"),
}

export const resolveStatic = (ref: Ref, ir: Ir, context: RefContext = {}): StaticResult =>
  RESOLVERS[ref.root](ref, ir, context)
