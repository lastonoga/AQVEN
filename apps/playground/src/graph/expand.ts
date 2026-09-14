import { extraFacts, nodeFacts } from "./node-facts.js"
import { caseLabelsOf, refText, sourcesOf } from "./refs.js"
import type { Ir, IrNode } from "../api/types.js"
import type { Fact, InputRef, NestedNode } from "./node-facts.js"

export type EdgeKind = "data" | "branch" | "fanout" | "fanin" | "loop"

export type GroupInfo = {
  component: string
  role: string
  parallel: boolean
  branches: number
  leaves: number
  badge: string
  note: string
}

export type NodeInfo = {
  description: string
  facts: Fact[]
  inputs: InputRef[]
  outputType: string
  nested: NestedNode | null
}

export type ExpandedNode = {
  id: string
  label: string
  parentId: string | null
  rootId: string
  depth: number
  kind: string
  note: string
  info: NodeInfo
  group: GroupInfo | null
  body: IrNode | null
}

export type ExpandedEdge = {
  id: string
  source: string
  target: string
  kind: EdgeKind
  label: string
}

export type ExpandedGraph = {
  nodes: ExpandedNode[]
  edges: ExpandedEdge[]
}

export type GraphEdge = ExpandedEdge

const EMPTY_INFO: NodeInfo = { description: "", facts: [], inputs: [], outputType: "—", nested: null }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isIrNode = (value: unknown): value is IrNode =>
  isRecord(value) && typeof value["kind"] === "string"

const text = (body: IrNode, key: string): string => {
  const value = body[key]
  return typeof value === "string" ? value : ""
}

const numberOf = (body: IrNode, key: string): number => {
  const value = body[key]
  return typeof value === "number" ? value : 0
}

const slotConst = (body: IrNode, slot: string): unknown => {
  const slots = body["in"]
  if (!isRecord(slots)) return undefined
  const value = slots[slot]
  if (!isRecord(value)) return undefined
  return value["const"]
}

const branchCountOf = (body: IrNode): number => {
  const value = slotConst(body, "n")
  return typeof value === "number" ? value : 0
}

type VaryAxis = { key: string; values: string[] }

const varyOf = (body: IrNode): VaryAxis | null => {
  const vary = slotConst(body, "vary")
  if (!isRecord(vary)) return null
  const first = Object.entries(vary)[0]
  if (first === undefined) return null
  const [key, values] = first
  if (!Array.isArray(values)) return null
  return { key, values: values.map((value) => String(value)) }
}

type RoleRef = { role: string; component: string }

type Part = { id: string; label: string; component: string; role: string; variant: string }

const componentRef = (value: unknown): string | null =>
  isRecord(value) && typeof value["component"] === "string" ? value["component"] : null

const rolesOfEntry = (role: string, value: unknown): RoleRef[] => {
  const single = componentRef(value)
  if (single !== null) return [{ role, component: single }]
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const component = componentRef(item)
    return component === null ? [] : [{ role: `${role} ${index + 1}`, component }]
  })
}

const rolesOf = (body: IrNode): RoleRef[] => {
  const params = body["params"]
  if (!isRecord(params)) return []
  return Object.entries(params).flatMap(([role, value]) => rolesOfEntry(role, value))
}

const hasArrayParam = (body: IrNode): boolean => {
  const params = body["params"]
  if (!isRecord(params)) return false
  return Object.values(params).some((value) => Array.isArray(value))
}

type Branch = { name: string; variant: string }

const variantOf = (vary: VaryAxis | null, index: number): string => {
  if (vary === null) return ""
  return `${vary.key} = ${vary.values[index] ?? index + 1}`
}

const branchesOf = (total: number, vary: VaryAxis | null): Branch[] =>
  Array.from({ length: total }, (_, index) => ({
    name: `ветка ${index + 1}`,
    variant: variantOf(vary, index),
  }))

const branchEdgeLabel = (branch: Branch): string =>
  branch.variant === "" ? branch.name : branch.variant

const varyNote = (vary: VaryAxis | null): string =>
  vary === null ? "" : `${vary.key}: ${vary.values.join(", ")}`

const infoOf = (body: IrNode): NodeInfo => {
  const facts = nodeFacts(body)
  return {
    description: text(body, "description"),
    facts: [...facts.facts, ...extraFacts(body)],
    inputs: facts.inputs,
    outputType: facts.outputType,
    nested: facts.nested,
  }
}

class Expansion {
  private readonly nodes: ExpandedNode[] = []
  private readonly edges: ExpandedEdge[] = []
  private readonly scopes: Record<string, string>[] = [{}]

  constructor(private readonly ir: Ir) {}

  build(): ExpandedGraph {
    this.emitLevel(null, "", this.ir.nodes)
    return { nodes: this.finish(), edges: this.edges }
  }

  private link(source: string, target: string, kind: EdgeKind, label: string): void {
    const id = `${source}=>${target}`
    if (this.edges.some((edge) => edge.id === id)) return
    this.edges.push({ id, source, target, kind, label })
  }

  private push(node: ExpandedNode): void {
    this.nodes.push(node)
  }

  private resolveComponent(name: string): string {
    if (!name.startsWith("$")) return name
    const scope = this.scopes[this.scopes.length - 1] ?? {}
    return scope[name.slice(1)] ?? name
  }

  private bindingsOf(body: IrNode): Record<string, string> {
    const params = body["params"]
    if (!isRecord(params)) return {}
    const pairs = Object.entries(params).flatMap(([role, value]) => {
      const component = componentRef(value)
      if (component === null) return []
      return [[role, this.resolveComponent(component)] as const]
    })
    return Object.fromEntries(pairs)
  }

  private inScope(bindings: Record<string, string>, emit: () => void): void {
    this.scopes.push(bindings)
    emit()
    this.scopes.pop()
  }

  private emitLevel(parentId: string | null, prefix: string, bodies: Record<string, IrNode>): void {
    const known = new Set(Object.keys(bodies))
    for (const [local, body] of Object.entries(bodies)) {
      this.emitNode(parentId, `${prefix}${local}`, local, body)
    }
    for (const [local, body] of Object.entries(bodies)) {
      const labels = caseLabelsOf(body, known)
      for (const source of sourcesOf(body, known)) {
        if (source === local) continue
        const label = labels.get(source) ?? ""
        this.link(`${prefix}${source}`, `${prefix}${local}`, label === "" ? "data" : "branch", label)
      }
    }
  }

  private unresolvedNote(body: IrNode): string {
    if (body.kind !== "call") return ""
    const component = this.resolveComponent(text(body, "component"))
    if (this.ir.components[component] !== undefined) return ""
    if (component.startsWith("$")) return `параметр ${component} не связан`
    return `тело ${component} не объявлено`
  }

  private emitNode(parentId: string | null, id: string, label: string, body: IrNode): void {
    const note = this.unresolvedNote(body)
    const group = this.expand(id, body)
    this.push({
      id,
      label,
      parentId,
      rootId: id,
      depth: 0,
      kind: body.kind,
      note: group === null ? note : "",
      info: infoOf(body),
      group,
      body,
    })
  }

  private emitFan(parentId: string, id: string, kind: EdgeKind, label: string, note: string): string {
    this.push({
      id,
      label,
      parentId,
      rootId: id,
      depth: 0,
      kind,
      note,
      info: EMPTY_INFO,
      group: null,
      body: null,
    })
    return id
  }

  private emitOpaque(parentId: string, part: Part): void {
    const variant = part.variant === "" ? [] : [{ label: "вариация", value: part.variant }]
    this.push({
      id: part.id,
      label: part.label,
      parentId,
      rootId: part.id,
      depth: 0,
      kind: "call",
      note: "тело компонента не объявлено",
      info: {
        ...EMPTY_INFO,
        facts: [{ label: "компонент", value: part.component }, ...variant],
      },
      group: null,
      body: null,
    })
  }

  private emitComponentGroup(parentId: string, part: Part): void {
    const name = this.resolveComponent(part.component)
    const declared = this.ir.components[name]
    if (declared === undefined) return this.emitOpaque(parentId, { ...part, component: name })
    this.inScope({}, () => this.emitLevel(part.id, `${part.id}/`, declared.nodes))
    this.push({
      id: part.id,
      label: part.label,
      parentId,
      rootId: part.id,
      depth: 0,
      kind: "call",
      note: "",
      info: { ...EMPTY_INFO, outputType: declared.out.type },
      group: {
        component: name,
        role: part.role,
        parallel: false,
        branches: 0,
        leaves: 0,
        badge: part.variant,
        note: declared.out.from,
      },
      body: null,
    })
  }

  private readonly expanders: Record<string, (id: string, body: IrNode) => GroupInfo | null> = {
    call: (id, body) => this.expandCall(id, body),
    map: (id, body) => this.expandMap(id, body),
    loop: (id, body) => this.expandLoop(id, body),
  }

  private expand(id: string, body: IrNode): GroupInfo | null {
    const expander = this.expanders[body.kind]
    if (expander === undefined) return null
    return expander(id, body)
  }

  private expandMap(id: string, body: IrNode): GroupInfo | null {
    const inner = body["do"]
    if (!isIrNode(inner)) return null
    const concurrency = numberOf(body, "concurrency")
    const lanes = concurrency === 0 ? 1 : concurrency
    const over = refText(body["over"])
    const split = this.emitFan(id, `${id}/split`, "fanout", "по элементу", `${over} · до ${lanes} сразу`)
    const produces = text(inner, "out")
    const collected = produces === "" ? infoOf(body).outputType : `${produces}[]`
    const join = this.emitFan(id, `${id}/join`, "fanin", "собрать", collected)
    const item = `${id}/item`
    this.emitNode(id, item, "элемент", inner)
    this.link(split, item, lanes > 1 ? "fanout" : "loop", "$item")
    this.link(item, join, "fanin", "")
    return {
      component: "map",
      role: "по каждому элементу",
      parallel: lanes > 1,
      branches: lanes,
      leaves: 0,
      badge: lanes > 1 ? `до ${lanes} параллельно` : "",
      note: `над ${over}`,
    }
  }

  private expandLoop(id: string, body: IrNode): GroupInfo | null {
    const inner = body["body"]
    if (!isIrNode(inner)) return null
    const maxIter = numberOf(body, "maxIter")
    const split = this.emitFan(id, `${id}/split`, "fanout", "итерация", `до ${maxIter}`)
    const join = this.emitFan(id, `${id}/join`, "fanin", "условие", text(body, "select"))
    const inside = `${id}/body`
    this.emitNode(id, inside, "тело", inner)
    this.link(split, inside, "loop", "$acc")
    this.link(inside, join, "fanin", "")
    this.link(join, split, "loop", `до ${maxIter} итераций`)
    return {
      component: "loop",
      role: "цикл",
      parallel: false,
      branches: 1,
      leaves: 0,
      badge: `до ${maxIter} итераций`,
      note: text(body, "select"),
    }
  }

  private expandCall(id: string, body: IrNode): GroupInfo | null {
    const component = this.resolveComponent(text(body, "component"))
    const declared = this.ir.components[component]
    const total = branchCountOf(body)
    const vary = varyOf(body)

    if (declared !== undefined) {
      this.inScope(this.bindingsOf(body), () => this.emitLevel(id, `${id}/`, declared.nodes))
      return {
        component,
        role: "тело компонента",
        parallel: total > 1,
        branches: total,
        leaves: 0,
        badge: total > 1 ? `параллельно ×${total}` : "",
        note: vary === null ? declared.out.from : varyNote(vary),
      }
    }

    const roles = rolesOf(body).map((role) => ({ ...role, component: this.resolveComponent(role.component) }))
    const head = roles[0]

    if (head === undefined && total > 1) return this.expandOpaqueFanout(id, component, total, vary)
    if (head === undefined) return null
    if (roles.length === 1 && total > 1) return this.expandReplicated(id, component, head, total, vary)
    if (roles.length > 1 && hasArrayParam(body)) return this.expandParallelRoles(id, component, roles)
    return this.expandChain(id, component, roles)
  }

  private expandReplicated(
    id: string,
    component: string,
    role: RoleRef,
    total: number,
    vary: VaryAxis | null,
  ): GroupInfo {
    const split = this.emitFan(id, `${id}/split`, "fanout", "разветвление", `${role.component} ×${total}`)
    const join = this.emitFan(id, `${id}/join`, "fanin", "сведение", `${component} → массив`)
    branchesOf(total, vary).forEach((branch, index) => {
      const at = `${id}/b${index}`
      this.emitComponentGroup(id, {
        id: at,
        label: branch.name,
        component: role.component,
        role: role.role,
        variant: branch.variant,
      })
      this.link(split, at, "fanout", branchEdgeLabel(branch))
      this.link(at, join, "fanin", "")
    })
    return {
      component,
      role: "параллельные ветки",
      parallel: true,
      branches: total,
      leaves: 0,
      badge: `параллельно ×${total}`,
      note: varyNote(vary),
    }
  }

  private expandParallelRoles(id: string, component: string, roles: readonly RoleRef[]): GroupInfo {
    const split = this.emitFan(id, `${id}/split`, "fanout", "разветвление", `ролей ${roles.length}`)
    const join = this.emitFan(id, `${id}/join`, "fanin", "сведение", component)
    roles.forEach((role, index) => {
      const at = `${id}/r${index}`
      this.emitComponentGroup(id, { id: at, label: role.role, ...role, variant: "" })
      this.link(split, at, "fanout", role.role)
      this.link(at, join, "fanin", "")
    })
    return {
      component,
      role: "параллельные роли",
      parallel: true,
      branches: roles.length,
      leaves: 0,
      badge: `параллельно ×${roles.length}`,
      note: roles.map((role) => role.component).join(", "),
    }
  }

  private expandChain(id: string, component: string, roles: readonly RoleRef[]): GroupInfo {
    roles.forEach((role, index) => {
      const at = `${id}/r${index}`
      this.emitComponentGroup(id, { id: at, label: role.role, ...role, variant: "" })
      if (index > 0) this.link(`${id}/r${index - 1}`, at, "data", "")
    })
    return {
      component,
      role: "этапы компонента",
      parallel: false,
      branches: roles.length,
      leaves: 0,
      badge: "",
      note: roles.map((role) => role.role).join(" → "),
    }
  }

  private expandOpaqueFanout(
    id: string,
    component: string,
    total: number,
    vary: VaryAxis | null,
  ): GroupInfo {
    const split = this.emitFan(id, `${id}/split`, "fanout", "разветвление", `${component} ×${total}`)
    const join = this.emitFan(id, `${id}/join`, "fanin", "сведение", component)
    branchesOf(total, vary).forEach((branch, index) => {
      const at = `${id}/b${index}`
      this.emitOpaque(id, {
        id: at,
        label: branch.name,
        component,
        role: "ветка",
        variant: branch.variant,
      })
      this.link(split, at, "fanout", branchEdgeLabel(branch))
      this.link(at, join, "fanin", "")
    })
    return {
      component,
      role: "параллельные вызовы",
      parallel: true,
      branches: total,
      leaves: 0,
      badge: `параллельно ×${total}`,
      note: varyNote(vary),
    }
  }

  private finish(): ExpandedNode[] {
    const byId = new Map(this.nodes.map((node) => [node.id, node]))
    const children = new Map<string, string[]>()
    for (const node of this.nodes) {
      if (node.parentId === null) continue
      const bucket = children.get(node.parentId) ?? []
      bucket.push(node.id)
      children.set(node.parentId, bucket)
    }

    const depthOf = (node: ExpandedNode): number => {
      let depth = 0
      let cursor = node.parentId
      while (cursor !== null) {
        depth += 1
        cursor = byId.get(cursor)?.parentId ?? null
      }
      return depth
    }

    const rootOf = (node: ExpandedNode): string => {
      let cursor = node
      while (cursor.parentId !== null) {
        const parent = byId.get(cursor.parentId)
        if (parent === undefined) return cursor.id
        cursor = parent
      }
      return cursor.id
    }

    const leavesUnder = (id: string): number => {
      const kids = children.get(id) ?? []
      if (kids.length === 0) return 1
      return kids.reduce((sum, kid) => {
        const child = byId.get(kid)
        if (child === undefined) return sum
        if (child.kind === "fanout" || child.kind === "fanin") return sum
        return sum + leavesUnder(kid)
      }, 0)
    }

    return this.nodes.map((node) => ({
      ...node,
      depth: depthOf(node),
      rootId: rootOf(node),
      group: node.group === null ? null : { ...node.group, leaves: leavesUnder(node.id) },
    }))
  }
}

export const expandIr = (ir: Ir): ExpandedGraph => new Expansion(ir).build()

export const rootNodesOf = (graph: ExpandedGraph): ExpandedNode[] =>
  graph.nodes.filter((node) => node.parentId === null)

export const rootEdgesOf = (graph: ExpandedGraph): ExpandedEdge[] => {
  const roots = new Set(rootNodesOf(graph).map((node) => node.id))
  return graph.edges.filter((edge) => roots.has(edge.source) && roots.has(edge.target))
}
