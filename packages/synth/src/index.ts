import { NODE, REF, isRef, root } from "@wf/dsl"
import type { Flow } from "@wf/dsl"

export type Diagnostic = {
  code: string
  message: string
  nodeId?: string
  slot?: string
}

export type IrNode = Record<string, unknown>
export type Binding = string | { const: unknown }

export type IrComponent = {
  name: string
  out: { type: string; from: string }
  nodes: Record<string, IrNode>
}

export type Ir = {
  flow: string
  version: number
  input: string
  output: { type: string; from: string }
  context?: string[]
  budget?: object
  policies?: object
  defaults?: object
  components: Record<string, IrComponent>
  nodes: Record<string, IrNode>
}

export type Origin = { call: string; component: string; node: string }

export type ExpandedGroup = {
  call: string
  component: string
  parent: string
  host: string
  returns: Binding
  nodes: string[]
}

export type ExpandedIr = {
  flow: string
  version: number
  input: string
  output: { type: string; from: Binding }
  context?: string[]
  budget?: object
  policies?: object
  defaults?: object
  groups: Record<string, ExpandedGroup>
  nodes: Record<string, IrNode>
}

export type SynthResult =
  | { ok: true; ir: Ir; expandedIr: ExpandedIr; diagnostics: Diagnostic[] }
  | { ok: false; ir: null; expandedIr: null; diagnostics: Diagnostic[] }

type RefCore = { node: unknown; path: string[] }

const isNode = (v: unknown): boolean => !!v && typeof v === "object" && NODE in (v as object)
const step = (s: string): string => (s.startsWith("[") ? s : "." + s)

const bodyOf = (n: unknown): Record<string, unknown> =>
  (n as { [NODE]: Record<string, unknown> })[NODE]

class Synthesizer {
  private readonly ids = new Map<unknown, string>()
  private readonly components: unknown[] = []
  readonly diagnostics: Diagnostic[] = []

  register(nodes: readonly unknown[]): void {
    for (const n of nodes) this.ids.set(n, bodyOf(n)["id"] as string)
  }

  registerComponents(components?: Record<string, unknown>): void {
    for (const c of Object.values(components ?? {})) {
      this.components.push(c)
      this.register((c as { nodes: readonly unknown[] }).nodes)
    }
  }

  private idOf(n: unknown): string {
    const id = this.ids.get(n)
    if (id !== undefined) return id
    const claimed = isNode(n) ? String(bodyOf(n)["id"]) : "<unknown>"
    this.diagnostics.push({
      code: "WF_UNREGISTERED_NODE",
      message: `ссылка указывает на узел «${claimed}», которого нет в списке nodes`,
      nodeId: claimed,
    })
    return claimed
  }

  private refToPath(r: unknown): string {
    const core = (r as { [REF]: RefCore })[REF]
    const first = core.path[0] ?? ""
    const head = core.node === null ? "$" + first : "$" + this.idOf(core.node) + step(first)
    return head + core.path.slice(1).map(step).join("")
  }

  private walk(v: unknown): unknown {
    if (isRef(v)) return this.refToPath(v)
    if (this.components.includes(v)) return { component: (v as { name: string }).name }
    if (isNode(v)) return { node: this.idOf(v) }
    if (Array.isArray(v)) return v.map((x) => this.walk(x))
    if (typeof v !== "object" || v === null) return v
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.walk(x)]))
  }

  private expandMap(body: Record<string, unknown>): void {
    const make = body["do"] as (item: unknown) => unknown
    body["do"] = this.node(make(root("item")))
  }

  private expandLoop(body: Record<string, unknown>): void {
    const make = body["body"] as ((acc: unknown, iter: unknown) => unknown) | undefined
    if (make === undefined) {
      this.diagnostics.push({
        code: "WF_LOOP_WITHOUT_BODY",
        message: "у узла loop нет тела: поле body обязательно",
      })
      return
    }
    body["body"] = this.node(make(root("acc"), root("iter")))

    const stop = body["stopWhen"] as ((iter: unknown) => unknown) | undefined
    if (stop === undefined) {
      this.diagnostics.push({
        code: "WF_LOOP_WITHOUT_STOP",
        message: "у узла loop нет условия остановки: поле stopWhen обязательно (R-L3)",
      })
      return
    }
    body["stopWhen"] = this.walk(stop(root("iter")))
  }

  private readonly expanders: Record<string, (body: Record<string, unknown>) => void> = {
    map: (body) => this.expandMap(body),
    loop: (body) => this.expandLoop(body),
  }

  private static readonly PRE_EXPANDED = new Set(["do", "body", "stopWhen"])

  node(n: unknown): IrNode {
    const { id: _id, ...rest } = { ...bodyOf(n) }
    const body = rest as Record<string, unknown>
    const expand = this.expanders[String(body["kind"])]
    if (expand !== undefined) expand(body)

    const entries = Object.entries(body).filter(([, v]) => v !== undefined)
    return Object.fromEntries(
      entries.map(([k, v]) => [k, Synthesizer.PRE_EXPANDED.has(k) ? v : this.walk(v)]),
    )
  }

  component(c: unknown): IrComponent {
    const comp = c as { name: string; out: { type: string; from: unknown }; nodes: readonly unknown[] }
    return {
      name: comp.name,
      out: { type: comp.out.type, from: this.refToPath(comp.out.from) },
      nodes: Object.fromEntries(comp.nodes.map((n) => [bodyOf(n)["id"] as string, this.node(n)])),
    }
  }

  flowOutput(out: { type: string; from: unknown }): { type: string; from: string } {
    return { type: out.type, from: this.refToPath(out.from) }
  }
}

export const NAMESPACE_SEPARATOR = "__"
const EXPANSION_DEPTH_LIMIT = 16
const PARAM_ROOTS = new Set(["params", "param"])
const RESERVED_ROOTS = new Set(["input", "item", "index", "acc", "iter", "run", "in", "out"])

const HEAD = /^\$([A-Za-z_][A-Za-z0-9_]*)/
const OUT_HEAD = /^\$([A-Za-z_][A-Za-z0-9_]*)\.out(?![A-Za-z0-9_])/
const FIELD = /^\.([A-Za-z_][A-Za-z0-9_]*)/
const INDEX = /^\[(\d+)\]/

type Frame = {
  prefix: string
  call: string
  component: string
  args: Record<string, unknown>
  params: Record<string, unknown>
  ids: ReadonlySet<string>
  stack: readonly string[]
}

type Head = { name: string; rest: string }
type Site = { node: string; path: string }

const siteId = (site: Site): string => site.node + site.path
const descend = (site: Site, key: string): Site => ({ node: site.node, path: site.path + NAMESPACE_SEPARATOR + key })
const indexed = (site: Site, i: number): Site => ({ node: site.node, path: `${site.path}_${i}` })

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const isRefString = (v: unknown): v is string => typeof v === "string" && v.startsWith("$")

const matchHead = (pattern: RegExp, ref: string): Head | null => {
  const m = pattern.exec(ref)
  const name = m === null ? undefined : m[1]
  if (m === null || name === undefined) return null
  return { name, rest: ref.slice(m[0].length) }
}

const nodeRefOf = (v: unknown): string | null => {
  if (!isObject(v)) return null
  const keys = Object.keys(v)
  const id = v["node"]
  if (keys.length !== 1 || typeof id !== "string") return null
  return id
}

const componentNameOf = (v: unknown): string | null => {
  if (typeof v === "string" && !v.startsWith("$")) return v
  if (!isObject(v)) return null
  if (typeof v["component"] === "string") return v["component"]
  if ("const" in v) return componentNameOf(v["const"])
  return null
}

const stepInto = (value: unknown, rest: string): { value: unknown; rest: string } | null => {
  const field = matchHead(FIELD, rest)
  if (field !== null && isObject(value)) return { value: value[field.name], rest: field.rest }
  const index = INDEX.exec(rest)
  const at = index === null ? undefined : index[1]
  if (index !== null && at !== undefined && Array.isArray(value)) {
    return { value: value[Number(at)], rest: rest.slice(index[0].length) }
  }
  return null
}

const project = (value: unknown, path: string): { ok: boolean; value: unknown } => {
  let current: unknown = value
  let rest = path
  while (rest.length > 0) {
    const next = stepInto(current, rest)
    if (next === null) return { ok: false, value }
    current = next.value
    rest = next.rest
  }
  return { ok: true, value: current }
}

const entriesOf = (nodes: Record<string, IrNode>): { id: string; body: IrNode }[] =>
  Object.entries(nodes).flatMap(([id, body]) => (isObject(body) ? [{ id, body }] : []))

const mapValues = (node: IrNode, f: (v: unknown, k: string) => unknown): IrNode =>
  Object.fromEntries(Object.entries(node).map(([k, v]) => [k, f(v, k)]))

class Expander {
  private readonly redirects = new Map<string, Binding>()
  private readonly groups: Record<string, ExpandedGroup> = {}
  readonly diagnostics: Diagnostic[] = []

  constructor(private readonly components: Record<string, IrComponent>) {}

  expand(ir: Ir): ExpandedIr {
    const top: Frame = {
      prefix: "",
      call: "",
      component: "",
      args: {},
      params: {},
      ids: new Set(Object.keys(ir.nodes)),
      stack: [],
    }
    const nodes = this.frameNodes(ir.nodes, top)
    return {
      flow: ir.flow,
      version: ir.version,
      input: ir.input,
      output: { type: ir.output.type, from: this.resolveBinding(ir.output.from, 0) },
      context: ir.context,
      budget: ir.budget,
      policies: ir.policies,
      defaults: ir.defaults,
      groups: this.resolvedGroups(),
      nodes: Object.fromEntries(
        Object.entries(nodes).map(([id, body]) => [id, mapValues(body, (v) => this.resolveValue(v))]),
      ),
    }
  }

  private frameNodes(nodes: Record<string, IrNode>, frame: Frame): Record<string, IrNode> {
    const out: Record<string, IrNode> = {}
    for (const { id, body } of entriesOf(nodes)) this.place(out, id, body, frame)
    return out
  }

  private place(out: Record<string, IrNode>, id: string, body: IrNode, frame: Frame): void {
    const qualified = frame.prefix + id
    const site: Site = { node: qualified, path: "" }
    const moved: IrNode = { ...this.rewriteBody(body, frame, site), ...this.originOf(id, frame) }
    if (body["kind"] !== "call") {
      out[qualified] = moved
      return
    }
    const target = this.target(moved["component"], frame, site)
    if (target === null) {
      out[qualified] = { ...moved, bodyAvailable: false }
      return
    }
    const child = this.childFrame(qualified, target, moved, frame)
    const inner = this.frameNodes(target.nodes, child)
    const returns = this.rewriteRef(target.out.from, child, site)
    this.redirects.set(qualified, returns)
    this.group(qualified, target.name, frame.call, "", returns, Object.keys(inner))
    Object.assign(out, inner)
  }

  private group(call: string, component: string, parent: string, host: string, returns: Binding, nodes: string[]): void {
    this.groups[call] = { call, component, parent, host, returns, nodes }
  }

  private originOf(id: string, frame: Frame): { origin?: Origin } {
    if (frame.call === "") return {}
    return { origin: { call: frame.call, component: frame.component, node: id } }
  }

  private childFrame(call: string, target: IrComponent, moved: IrNode, frame: Frame): Frame {
    return {
      prefix: call + NAMESPACE_SEPARATOR,
      call,
      component: target.name,
      args: isObject(moved["in"]) ? moved["in"] : {},
      params: isObject(moved["params"]) ? moved["params"] : {},
      ids: new Set(Object.keys(target.nodes)),
      stack: [...frame.stack, target.name],
    }
  }

  private target(value: unknown, frame: Frame, site: Site): IrComponent | null {
    const name = this.componentName(value, frame)
    if (name === null) return null
    const found = this.components[name]
    if (found === undefined) return null
    if (frame.stack.includes(name)) {
      this.diagnostics.push({
        code: "WF_COMPONENT_CYCLE",
        message: `компонент «${name}» вызывает сам себя: цепочка ${[...frame.stack, name].join(" → ")}`,
        nodeId: site.node,
      })
      return null
    }
    if (frame.stack.length >= EXPANSION_DEPTH_LIMIT) {
      this.diagnostics.push({
        code: "WF_EXPANSION_TOO_DEEP",
        message: `глубина раскрытия компонентов превысила ${EXPANSION_DEPTH_LIMIT} на «${name}»`,
        nodeId: site.node,
      })
      return null
    }
    return found
  }

  private componentName(value: unknown, frame: Frame): string | null {
    const direct = componentNameOf(value)
    if (direct !== null) return direct
    if (!isRefString(value)) return null
    return componentNameOf(this.paramValue(value, frame))
  }

  private paramValue(ref: string, frame: Frame): unknown {
    const head = matchHead(HEAD, ref)
    if (head === null) return undefined
    if (!PARAM_ROOTS.has(head.name)) return this.fromScope(head.name, head.rest, frame)
    const field = matchHead(FIELD, head.rest)
    if (field === null) return undefined
    return this.fromScope(field.name, field.rest, frame)
  }

  private fromScope(name: string, rest: string, frame: Frame): unknown {
    if (RESERVED_ROOTS.has(name)) return undefined
    const base = frame.params[name]
    if (base === undefined) return undefined
    const projected = project(base, rest)
    return projected.ok ? projected.value : undefined
  }

  private rewriteBody(body: IrNode, frame: Frame, site: Site): IrNode {
    const unrolled = this.unrolledMap(body, frame, site)
    if (unrolled !== null) return unrolled
    return mapValues(body, (v, k) => this.rewriteValue(v, frame, descend(site, k)))
  }

  private unrolledMap(body: IrNode, frame: Frame, site: Site): IrNode | null {
    if (body["kind"] !== "map") return null
    const branches = this.componentList(body["over"], frame)
    const inner = body["do"]
    if (branches === null || !isObject(inner) || inner["kind"] !== "call") return null
    if (this.componentName(inner["component"], frame) !== null) return null
    const rewritten = mapValues(body, (v, k) =>
      k === "do" ? v : this.rewriteValue(v, frame, descend(site, k)),
    )
    return { ...rewritten, do: this.unrollCall(inner, branches, frame, descend(site, "do")) }
  }

  private componentList(over: unknown, frame: Frame): string[] | null {
    if (!isRefString(over)) return null
    const bound = this.paramValue(over, frame)
    if (!Array.isArray(bound) || bound.length === 0) return null
    const names = bound.flatMap((x) => {
      const name = componentNameOf(x)
      return name === null ? [] : [name]
    })
    return names.length === bound.length ? names : null
  }

  private unrollCall(body: IrNode, branches: string[], frame: Frame, site: Site): IrNode {
    const moved = mapValues(body, (v, k) => this.rewriteValue(v, frame, descend(site, k)))
    const bodies = Object.fromEntries(
      branches.flatMap((name) => {
        const target = this.components[name]
        if (target === undefined) return []
        return [[name, this.branchBody(name, target, moved, frame, site)]]
      }),
    )
    if (Object.keys(bodies).length === 0) return { ...moved, bodyAvailable: false }
    return { ...moved, bodyAvailable: true, bodies }
  }

  private branchBody(name: string, target: IrComponent, moved: IrNode, frame: Frame, site: Site): unknown {
    const call = siteId(site) + NAMESPACE_SEPARATOR + name
    const child = this.childFrame(call, target, moved, frame)
    const nodes = this.frameNodes(target.nodes, child)
    const returns = this.rewriteRef(target.out.from, child, site)
    this.group(call, name, frame.call, site.node, returns, Object.keys(nodes))
    return { component: name, returns, nodes }
  }

  private rewriteValue(value: unknown, frame: Frame, site: Site): unknown {
    if (isRefString(value)) return this.rewriteRef(value, frame, site)
    if (Array.isArray(value)) return value.map((x, i) => this.rewriteValue(x, frame, indexed(site, i)))
    if (!isObject(value)) return value
    const id = nodeRefOf(value)
    if (id !== null) return frame.ids.has(id) ? { node: frame.prefix + id } : value
    if (value["kind"] === "call") return this.inlineCall(value, frame, site)
    return mapValues(value, (x, k) => this.rewriteValue(x, frame, descend(site, k)))
  }

  private inlineCall(body: IrNode, frame: Frame, site: Site): unknown {
    const moved = this.rewriteBody(body, frame, site)
    const target = this.target(moved["component"], frame, site)
    if (target === null) return { ...moved, bodyAvailable: false }
    const call = siteId(site)
    const child = this.childFrame(call, target, moved, frame)
    const inner = this.frameNodes(target.nodes, child)
    const returns = this.rewriteRef(target.out.from, child, site)
    this.group(call, target.name, frame.call, site.node, returns, Object.keys(inner))
    return { ...moved, component: target.name, bodyAvailable: true, body: { component: target.name, returns, nodes: inner } }
  }

  private rewriteRef(ref: string, frame: Frame, site: Site): Binding {
    const head = matchHead(HEAD, ref)
    if (head === null) return ref
    if (head.name === "in") return this.slotBinding(head.rest, frame, ref, site)
    if (frame.ids.has(head.name)) return "$" + frame.prefix + head.name + head.rest
    const bound = this.paramValue(ref, frame)
    if (bound === undefined) return ref
    return { const: bound }
  }

  private slotBinding(rest: string, frame: Frame, ref: string, site: Site): Binding {
    const field = matchHead(FIELD, rest)
    if (field === null) return ref
    const bound = frame.args[field.name]
    if (bound === undefined) {
      this.diagnostics.push({
        code: "WF_COMPONENT_SLOT_UNBOUND",
        message: `слот «${field.name}» компонента «${frame.component}» не связан в вызове «${frame.call}»`,
        nodeId: site.node,
        slot: field.name,
      })
      return ref
    }
    if (typeof bound === "string") return bound + field.rest
    return this.constBinding(bound, field.rest, frame, site)
  }

  private constBinding(bound: unknown, rest: string, frame: Frame, site: Site): Binding {
    const source = isObject(bound) && "const" in bound ? bound["const"] : bound
    const projected = project(source, rest)
    if (projected.ok) return { const: projected.value }
    this.diagnostics.push({
      code: "WF_CONST_PATH_UNRESOLVED",
      message: `путь «${rest}» не читается из константы слота компонента «${frame.component}»`,
      nodeId: site.node,
    })
    return { const: source }
  }

  private resolvedGroups(): Record<string, ExpandedGroup> {
    return Object.fromEntries(
      Object.entries(this.groups).map(([id, group]) => [
        id,
        { ...group, returns: this.resolveBinding(group.returns, 0) },
      ]),
    )
  }

  private resolveValue(value: unknown): unknown {
    if (isRefString(value)) return this.resolveBinding(value, 0)
    if (Array.isArray(value)) return value.map((x) => this.resolveValue(x))
    if (!isObject(value)) return value
    const id = nodeRefOf(value)
    if (id !== null && this.redirects.has(id)) return this.resolveBinding("$" + id + ".out", 0)
    return mapValues(value, (x) => this.resolveValue(x))
  }

  private resolveBinding(binding: Binding, depth: number): Binding {
    if (typeof binding !== "string") return binding
    const head = matchHead(OUT_HEAD, binding)
    if (head === null) return binding
    const target = this.redirects.get(head.name)
    if (target === undefined) return binding
    if (depth >= EXPANSION_DEPTH_LIMIT) {
      this.diagnostics.push({
        code: "WF_EXPANSION_TOO_DEEP",
        message: `цепочка выходов компонентов длиннее ${EXPANSION_DEPTH_LIMIT}: ${binding}`,
      })
      return binding
    }
    if (typeof target === "string") return this.resolveBinding(target + head.rest, depth + 1)
    const projected = project(target.const, head.rest)
    return { const: projected.value }
  }
}

export function expandIr(ir: Ir): { expandedIr: ExpandedIr; diagnostics: Diagnostic[] } {
  const expander = new Expander(ir.components)
  const expandedIr = expander.expand(ir)
  return { expandedIr, diagnostics: expander.diagnostics }
}

export function synthesize(flow: Flow): SynthResult {
  const s = new Synthesizer()
  s.register(flow.nodes)
  s.registerComponents(flow.components as Record<string, unknown> | undefined)

  const components = Object.fromEntries(
    Object.values((flow.components ?? {}) as Record<string, unknown>).map((c) => [
      (c as { name: string }).name,
      s.component(c),
    ]),
  )
  const nodes = Object.fromEntries(
    flow.nodes.map((n) => [bodyOf(n)["id"] as string, s.node(n)]),
  )

  const ir: Ir = {
    flow: flow.flow,
    version: flow.version,
    input: flow.input,
    output: s.flowOutput(flow.output),
    context: flow.context,
    budget: flow.budget,
    policies: flow.policies,
    defaults: flow.defaults,
    components,
    nodes,
  }

  if (s.diagnostics.some((d) => d.code === "WF_UNREGISTERED_NODE")) {
    return { ok: false, ir: null, expandedIr: null, diagnostics: s.diagnostics }
  }

  const expansion = expandIr(ir)
  return { ok: true, ir, expandedIr: expansion.expandedIr, diagnostics: [...s.diagnostics, ...expansion.diagnostics] }
}

function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize)
  if (v === null || typeof v !== "object") return v
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return Object.fromEntries(entries.map(([k, x]) => [k, canonicalize(x)]))
}

export function canonicalJson(ir: Ir): string {
  return JSON.stringify(canonicalize(ir))
}

export function irHash(ir: Ir): string {
  const canonical = canonicalJson(ir)
  let h = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}
