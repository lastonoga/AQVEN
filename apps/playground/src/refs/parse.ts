import { isRecord } from "./guards.js"
import type { ParseResult, Ref, RefError, RefRoot, RefSegment, SlotRef } from "./types.js"

const ROOT_ALIASES: Record<string, RefRoot> = {
  input: "input",
  in: "input",
  item: "item",
  acc: "acc",
  iter: "iter",
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/
const BRACKET = /^\[(\*|\d+)\]/

type Taken = { segment: RefSegment; rest: string }

const takeBracket = (rest: string): Taken | null => {
  const match = BRACKET.exec(rest)
  if (match === null) return null
  const token = match[1] ?? ""
  const segment: RefSegment = token === "*" ? { kind: "lift" } : { kind: "index", index: Number(token) }
  return { segment, rest: rest.slice(match[0].length) }
}

const takeField = (rest: string): Taken | null => {
  if (!rest.startsWith(".")) return null
  const match = NAME.exec(rest.slice(1))
  if (match === null) return null
  const name = match[0]
  return { segment: { kind: "field", name }, rest: rest.slice(1 + name.length) }
}

type Tail = { segments: RefSegment[] } | { stuck: string }

const readTail = (tail: string): Tail => {
  const segments: RefSegment[] = []
  let rest = tail
  while (rest.length > 0) {
    const taken = takeBracket(rest) ?? takeField(rest)
    if (taken === null) return { stuck: rest }
    segments.push(taken.segment)
    rest = taken.rest
  }
  return { segments }
}

const renderSegment = (segment: RefSegment): string => {
  if (segment.kind === "lift") return "[*]"
  if (segment.kind === "index") return `[${segment.index}]`
  return `.${segment.name}`
}

export const pathOf = (segments: readonly RefSegment[]): string =>
  segments.map(renderSegment).join("").replace(/^\./, "")

const fail = (code: RefError["code"], message: string): ParseResult => ({ ok: false, error: { code, message } })

export const parseRef = (path: string): ParseResult => {
  if (!path.startsWith("$")) return fail("not_a_ref", `«${path}» — не ссылка, ссылка начинается с $`)
  const head = NAME.exec(path.slice(1))
  if (head === null) return fail("empty_root", `у ссылки «${path}» нет имени корня`)
  const name = head[0]
  const tail = readTail(path.slice(1 + name.length))
  if ("stuck" in tail) return fail("bad_segment", `не разобран хвост «${tail.stuck}» в ссылке «${path}»`)
  const root = ROOT_ALIASES[name] ?? "node"
  const ref: Ref = {
    root,
    node: root === "node" ? name : "",
    segments: tail.segments,
    lifted: tail.segments.some((segment) => segment.kind === "lift"),
    path: pathOf(tail.segments),
    text: path,
  }
  return { ok: true, ref }
}

export const isRefString = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("$")

const refSlot = (text: string): SlotRef => {
  const parsed = parseRef(text)
  if (parsed.ok) return { kind: "ref", ref: parsed.ref }
  return { kind: "broken", error: parsed.error, value: text }
}

export const parseSlot = (value: unknown): SlotRef => {
  if (isRefString(value)) return refSlot(value)
  if (isRecord(value) && "const" in value) return { kind: "const", value: value["const"] }
  if (isRecord(value) && typeof value["node"] === "string") return refSlot(`$${value["node"]}.out`)
  return { kind: "inline", value }
}
