import * as z from "zod"
import { NODE, REF, isRef, root, typeRegistry } from "@wf/dsl"
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

export type JsonSchema = Record<string, unknown>

export type TypeKind = "object" | "enum" | "id" | "scalar" | "array" | "unknown"

export type IrType = {
  name: string
  kind: TypeKind
  declared: boolean
  description?: string
  example?: unknown
  schema?: JsonSchema
  valueDescriptions?: Record<string, string>
  source?: string
  allowedSet?: string
  codeFormat?: string
}

export type IrTypes = Record<string, IrType>

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
  types: IrTypes
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
  types: IrTypes
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

  private expandTry(body: Record<string, unknown>): void {
    const make = body["catch"] as ((error: unknown) => unknown) | undefined
    if (make === undefined) {
      this.diagnostics.push({
        code: "WF_TRY_WITHOUT_CATCH",
        message: "у узла try нет обработчика: поле catch обязательно",
      })
      return
    }
    body["catch"] = this.node(make(root("error")))
  }

  private readonly expanders: Record<string, (body: Record<string, unknown>) => void> = {
    map: (body) => this.expandMap(body),
    loop: (body) => this.expandLoop(body),
    try: (body) => this.expandTry(body),
  }

  private static readonly PRE_EXPANDED = new Set(["do", "body", "stopWhen", "catch"])

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
const RESERVED_ROOTS = new Set(["input", "item", "index", "acc", "iter", "error", "run", "in", "out"])

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
      types: ir.types,
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

export type TypeDeclaration = Record<string, unknown>
export type TypeCatalog = { get: (name: string) => unknown }
export type SynthOptions = { types?: TypeCatalog }

export const recordCatalog = (bag: Readonly<Record<string, unknown>>): TypeCatalog => ({
  get: (name) => bag[name],
})

const TYPE_FIELDS = new Set(["out", "itemType", "onType", "form", "errorType"])
const OPAQUE_FIELDS = new Set(["budget", "policies", "defaults", "overrides", "outputContract", "retry"])

const JSON_SCHEMA_OPTIONS = {
  target: "draft-2020-12",
  io: "output",
  unrepresentable: "throw",
  cycles: "throw",
  reused: "inline",
} as const

const KIND_ALIASES: Readonly<Record<string, TypeKind>> = {
  object: "object",
  record: "object",
  union: "object",
  enum: "enum",
  id: "id",
  array: "array",
  list: "array",
  scalar: "scalar",
  value: "scalar",
}

const SCHEMA_KINDS: ReadonlyArray<readonly [(s: JsonSchema) => boolean, TypeKind]> = [
  [(s) => Array.isArray(s["enum"]), "enum"],
  [(s) => s["type"] === "array", "array"],
  [(s) => s["type"] === "object" || isObject(s["properties"]), "object"],
  [(s) => typeof s["type"] === "string", "scalar"],
]

const ARRAY_SUFFIX = /\[\]$/

const isZodSchema = (v: unknown): v is z.core.$ZodType => isObject(v) && "_zod" in v

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const firstString = (...candidates: unknown[]): string | undefined =>
  candidates.find((c): c is string => typeof c === "string" && c.length > 0)

const jsonSchemaOf = (schema: z.core.$ZodType): JsonSchema => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, JSON_SCHEMA_OPTIONS) as JsonSchema
  return rest
}

const declarationOf = (catalog: TypeCatalog, name: string): TypeDeclaration | null => {
  const found = catalog.get(name)
  if (isZodSchema(found)) return { schema: found }
  return isObject(found) ? found : null
}

const kindOfSchema = (schema: JsonSchema): TypeKind =>
  SCHEMA_KINDS.find(([matches]) => matches(schema))?.[1] ?? "unknown"

const kindOfName = (name: string): TypeKind => (ARRAY_SUFFIX.test(name) ? "array" : "unknown")

const kindOf = (declared: unknown, schema: JsonSchema | null, name: string): TypeKind => {
  const alias = typeof declared === "string" ? KIND_ALIASES[declared] : undefined
  if (alias !== undefined) return alias
  if (schema !== null) return kindOfSchema(schema)
  return kindOfName(name)
}

const stringMap = (value: unknown): Record<string, string> => {
  if (!isObject(value)) return {}
  const pairs = Object.entries(value).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as const] : []))
  return Object.fromEntries(pairs)
}

const valueDescriptionsOf = (decl: TypeDeclaration, schema: JsonSchema | null): Record<string, string> => {
  const declared = { ...stringMap(decl["values"]), ...stringMap(decl["valueDescriptions"]) }
  const listed = schema === null ? undefined : schema["enum"]
  if (!Array.isArray(listed)) return declared
  return Object.fromEntries(listed.map((v) => [String(v), declared[String(v)] ?? ""]))
}

const exampleOf = (decl: TypeDeclaration, schema: JsonSchema | null): unknown => {
  if (decl["example"] !== undefined) return decl["example"]
  const listed = decl["examples"] ?? (schema === null ? undefined : schema["examples"])
  return Array.isArray(listed) ? listed[0] : undefined
}

class TypeRegistryBuilder {
  private readonly names = new Set<string>()
  readonly diagnostics: Diagnostic[] = []

  constructor(private readonly catalog: TypeCatalog) {}

  collect(ir: Ir): void {
    this.add(ir.input)
    this.add(ir.output.type)
    for (const component of Object.values(ir.components)) {
      this.add(component.out.type)
      this.scan(component.nodes)
    }
    this.scan(ir.nodes)
  }

  build(): IrTypes {
    const sorted = [...this.names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(sorted.map((name) => [name, this.describe(name)]))
  }

  private add(value: unknown): void {
    if (typeof value !== "string" || value.length === 0 || value.startsWith("$")) return
    this.names.add(value)
  }

  private scan(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach((x) => this.scan(x))
      return
    }
    if (!isObject(value)) return
    for (const [key, x] of Object.entries(value)) this.scanEntry(key, x)
  }

  private scanEntry(key: string, value: unknown): void {
    if (OPAQUE_FIELDS.has(key)) return
    if (key === "allowedSets") return this.scanAllowedSets(value)
    if (!TYPE_FIELDS.has(key)) return this.scan(value)
    this.add(value)
    if (isObject(value)) this.add(value["type"])
  }

  private scanAllowedSets(value: unknown): void {
    if (!Array.isArray(value)) return
    for (const set of value) if (isObject(set)) this.add(set["type"])
  }

  private describe(name: string): IrType {
    const decl = declarationOf(this.catalog, name)
    if (decl === null) return { name, kind: kindOfName(name), declared: false }
    return this.described(name, decl)
  }

  private described(name: string, decl: TypeDeclaration): IrType {
    const schema = this.compile(name, decl)
    const values = valueDescriptionsOf(decl, schema)
    const kind = kindOf(decl["kind"], schema, name)
    const description = firstString(decl["description"], schema?.["description"])
    const example = exampleOf(decl, schema)
    this.checkValueDescriptions(name, kind, values)
    return {
      name,
      kind,
      declared: schema !== null,
      ...(description === undefined ? {} : { description }),
      ...(example === undefined ? {} : { example }),
      ...(schema === null ? {} : { schema }),
      ...(Object.keys(values).length === 0 ? {} : { valueDescriptions: values }),
      ...this.identity(decl),
    }
  }

  private identity(decl: TypeDeclaration): Partial<IrType> {
    const source = firstString(decl["source"])
    const allowedSet = firstString(decl["allowedSet"])
    const codeFormat = firstString(decl["codeFormat"])
    return {
      ...(source === undefined ? {} : { source }),
      ...(allowedSet === undefined ? {} : { allowedSet }),
      ...(codeFormat === undefined ? {} : { codeFormat }),
    }
  }

  private compile(name: string, decl: TypeDeclaration): JsonSchema | null {
    const source = decl["schema"]
    if (!isZodSchema(source)) return null
    try {
      return jsonSchemaOf(source)
    } catch (error) {
      this.diagnostics.push({
        code: "WF_TYPE_SCHEMA_UNREPRESENTABLE",
        message: `схема типа «${name}» не переводится в JSON Schema: ${messageOf(error)}`,
      })
      return null
    }
  }

  private checkValueDescriptions(name: string, kind: TypeKind, values: Record<string, string>): void {
    if (kind !== "enum") return
    const missing = Object.entries(values).flatMap(([value, text]) => (text === "" ? [value] : []))
    if (missing.length === 0) return
    this.diagnostics.push({
      code: "WF_ENUM_VALUE_WITHOUT_DESCRIPTION",
      message: `значения enum «${name}» без описания: ${missing.join(", ")} — описание обязательно и попадает в промт`,
    })
  }
}

const flowCatalog = (flow: Flow): TypeCatalog | null => {
  const declared = (flow as { types?: unknown }).types
  return isObject(declared) ? recordCatalog(declared) : null
}

const catalogOf = (flow: Flow, options?: SynthOptions): TypeCatalog =>
  options?.types ?? flowCatalog(flow) ?? typeRegistry

export function expandIr(ir: Ir): { expandedIr: ExpandedIr; diagnostics: Diagnostic[] } {
  const expander = new Expander(ir.components)
  const expandedIr = expander.expand(ir)
  return { expandedIr, diagnostics: expander.diagnostics }
}

export function synthesize(flow: Flow, options?: SynthOptions): SynthResult {
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

  const draft: Ir = {
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
    types: {},
  }

  if (s.diagnostics.some((d) => d.code === "WF_UNREGISTERED_NODE")) {
    return { ok: false, ir: null, expandedIr: null, diagnostics: s.diagnostics }
  }

  const builder = new TypeRegistryBuilder(catalogOf(flow, options))
  builder.collect(draft)
  const ir: Ir = { ...draft, types: builder.build() }

  const expansion = expandIr(ir)
  return {
    ok: true,
    ir,
    expandedIr: expansion.expandedIr,
    diagnostics: [...s.diagnostics, ...builder.diagnostics, ...expansion.diagnostics],
  }
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
