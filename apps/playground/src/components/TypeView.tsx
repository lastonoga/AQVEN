import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { JsonView } from "./JsonView.js"
import { KeyValueRows } from "./KeyValueRows.js"
import { ValueView } from "./ValueView.js"
import {
  deref,
  describeOf,
  fieldsOf,
  formatOf,
  itemsOf,
  kindOf,
  labelOf,
  namedOf,
  readRegistry,
  resolveType,
  structureOf,
  valueDescriptionsOf,
} from "./type-registry.js"
import type { SchemaNode, TypeContext, TypeField, TypeLink, TypeRegistry } from "./type-registry.js"
import type { Ir } from "../api/index.js"

type Open = (type: string) => void

type ViewProps = { type: string; ir: Ir | null; onOpen?: Open }

type BodyProps = { node: SchemaNode | null; ctx: TypeContext; depth: number; onOpen: Open }

const MAX_DEPTH = 5
const CARD_ROWS = 6

const noop: Open = () => undefined

const kindLabels: Record<string, string> = {
  record: "запись",
  enum: "перечисление",
  union: "объединение",
  list: "список",
  id: "идентификатор",
  value: "значение",
  component: "компонент",
  view: "представление",
}

const allowedSetLabels: Record<string, string> = {
  static: "статическое, запечено в схему",
  dynamic: "динамическое, подставляется на вызове",
}

export const useTypeRegistry = (ir: Ir | null): TypeRegistry => useMemo(() => readRegistry(ir), [ir])

export const useTypeLink = (type: string, ir: Ir | null): TypeLink => {
  const registry = useTypeRegistry(ir)
  return useMemo(() => resolveType(registry, type), [registry, type])
}

export const kindLabel = (kind: string): string => kindLabels[kind] ?? kind

export const typeHeadline = (link: TypeLink): string => (link.expr.trim() === "" ? link.root : link.expr.trim())

const itemLabel = (link: TypeLink): string => {
  const items = itemsOf(deref(link.schema, link.context))
  return items === null ? "" : labelOf(items, link.context)
}

const linkNameOf = (node: SchemaNode | null, ctx: TypeContext): string => {
  const direct = namedOf(node, ctx.registry)
  if (direct !== "") return direct
  return namedOf(itemsOf(node), ctx.registry)
}

function Missing({ text }: { text: string }) {
  return <span className="font-mono text-[10.5px] text-slate-600">{text}</span>
}

function TypeRefLabel({ node, ctx, onOpen }: { node: SchemaNode | null; ctx: TypeContext; onOpen: Open }) {
  const label = labelOf(node, ctx)
  const name = linkNameOf(node, ctx)
  if (name === "" || ctx.registry[name] === undefined)
    return <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{label}</span>
  return (
    <button
      type="button"
      onClick={() => onOpen(name)}
      title={`открыть тип ${name}`}
      className="shrink-0 font-mono text-[10.5px] text-sky-400 hover:underline"
    >
      {label}
    </button>
  )
}

function Values({ node, values, ctx }: { node: SchemaNode; values: readonly string[]; ctx: TypeContext }) {
  const descriptions = valueDescriptionsOf(node, ctx)
  return (
    <div className="flex flex-col">
      {values.map((value) => (
        <div key={value} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-2 border-b border-slate-900 py-1 last:border-b-0">
          <span className="truncate font-mono text-[11.5px] text-amber-300" title={value}>
            {value}
          </span>
          {descriptions[value] === undefined ? (
            <Missing text="описание значения не объявлено" />
          ) : (
            <span className="text-[11.5px] leading-relaxed text-slate-300">{descriptions[value]}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function FieldRow({ field, ctx, depth, onOpen }: { field: TypeField } & Omit<BodyProps, "node">) {
  const [open, setOpen] = useState(false)
  const structure = structureOf(field.schema, ctx)
  const expandable = depth < MAX_DEPTH && structure.shape !== "none"
  const format = formatOf(field.schema)

  return (
    <div className="border-b border-slate-900 py-1 last:border-b-0">
      <div className="flex items-baseline gap-1.5">
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="w-2.5 shrink-0 font-mono text-[10px] text-slate-600 hover:text-slate-300"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-slate-200" title={field.name}>
          {field.name}
        </span>
        {!field.required && <span className="shrink-0 font-mono text-[10px] text-slate-600">опц.</span>}
        {field.nullable && <span className="shrink-0 font-mono text-[10px] text-amber-500/80">null</span>}
        {format !== "" && <span className="shrink-0 font-mono text-[10px] text-slate-500">{format}</span>}
        <TypeRefLabel node={field.schema} ctx={ctx} onOpen={onOpen} />
      </div>
      <div className="pl-4">
        {field.description === "" ? (
          <Missing text="описание поля не объявлено" />
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-400">{field.description}</p>
        )}
      </div>
      {open && (
        <div className="mt-1 ml-2 border-l border-slate-800 pl-2">
          <StructureBody node={field.schema} ctx={ctx} depth={depth + 1} onOpen={onOpen} />
        </div>
      )}
    </div>
  )
}

function StructureBody({ node, ctx, depth, onOpen }: BodyProps) {
  const structure = structureOf(node, ctx)
  if (structure.shape === "values") return <Values node={structure.node} values={structure.values} ctx={ctx} />
  if (structure.shape === "none")
    return <p className="text-[11.5px] leading-relaxed text-slate-500">Скалярное значение — вложенных полей нет.</p>
  const fields = fieldsOf(structure.node, ctx)
  if (fields.length === 0)
    return <p className="text-[11.5px] leading-relaxed text-slate-500">У записи нет объявленных полей.</p>
  return (
    <div className="flex flex-col">
      {fields.map((field) => (
        <FieldRow key={field.name} field={field} ctx={ctx} depth={depth} onOpen={onOpen} />
      ))}
    </div>
  )
}

function NoSchema({ headline }: { headline: string }) {
  return (
    <p className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1.5 text-[11.5px] leading-relaxed text-slate-400">
      Схема типа <span className="font-mono text-slate-300">{headline === "" ? "—" : headline}</span> не объявлена:
      в IR этот тип присутствует только именем. Структура, пример и блок формата вывода появятся, когда тип будет
      объявлен в реестре.
    </p>
  )
}

function Example({ link }: { link: TypeLink }) {
  if (link.path.length > 0) return <Missing text="пример объявляется у типа целиком" />
  if (link.entry === null || !link.entry.hasExample) return <Missing text="пример значения не объявлен" />
  return <ValueView value={link.entry.example} />
}

const headRows = (link: TypeLink): Array<{ label: string; value: string }> => {
  const entry = link.entry
  const kind = kindOf(link)
  return [
    { label: "Тип", value: typeHeadline(link) },
    { label: "Вид", value: kind === "" ? "" : kindLabel(kind) },
    { label: "Формат", value: formatOf(link.schema) },
    { label: "Элемент списка", value: itemLabel(link) },
    { label: "Источник значений", value: entry?.source ?? "" },
    {
      label: "Множество",
      value: entry === null ? "" : allowedSetLabels[entry.allowedSet] ?? entry.allowedSet,
    },
    { label: "Формат кода", value: entry?.codeFormat ?? "" },
  ]
}

const descriptionOf = (link: TypeLink): string => {
  if (link.path.length === 0 && link.entry !== null && link.entry.description !== "") return link.entry.description
  return describeOf(link.schema)
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px rounded-t border-b-2 px-2 py-1 text-[11px] ${
        active ? "border-sky-400 text-slate-100" : "border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {label}
    </button>
  )
}

export function TypeView({ type, ir, onOpen = noop }: ViewProps) {
  const link = useTypeLink(type, ir)
  const [tab, setTab] = useState<"human" | "schema">("human")
  const description = descriptionOf(link)
  const headline = typeHeadline(link)

  if (type.trim() === "")
    return <p className="text-[11.5px] leading-relaxed text-slate-500">Тип значения у этого места не объявлен.</p>

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <KeyValueRows rows={headRows(link)} />
      {description !== "" && <p className="text-[11.5px] leading-relaxed text-slate-300">{description}</p>}
      {link.schema === null && <NoSchema headline={headline} />}
      {link.schema !== null && (
        <>
          <nav className="flex gap-1 border-b border-slate-800">
            <Tab active={tab === "human"} label="структура" onClick={() => setTab("human")} />
            <Tab active={tab === "schema"} label="JSON Schema" onClick={() => setTab("schema")} />
          </nav>
          {tab === "human" ? (
            <StructureBody node={link.schema} ctx={link.context} depth={0} onOpen={onOpen} />
          ) : (
            <JsonView value={link.schema} />
          )}
        </>
      )}
      <div className="flex flex-col gap-1 border-t border-slate-800 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">пример значения</span>
        <Example link={link} />
      </div>
    </div>
  )
}

const CARD_GRID = "grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-2 py-[1px]"

function CardValues({ node, values, ctx }: { node: SchemaNode; values: readonly string[]; ctx: TypeContext }) {
  const descriptions = valueDescriptionsOf(node, ctx)
  const shown = values.slice(0, CARD_ROWS)
  return (
    <div className="flex flex-col">
      {shown.map((value) => (
        <div key={value} className={CARD_GRID}>
          <span className="truncate font-mono text-[11px] text-amber-300">{value}</span>
          <span className="truncate text-[11px] text-slate-400">{descriptions[value] ?? "—"}</span>
        </div>
      ))}
      {values.length > shown.length && <Missing text={`и ещё ${values.length - shown.length}`} />}
    </div>
  )
}

function CardFields({ node, ctx }: { node: SchemaNode; ctx: TypeContext }) {
  const fields = fieldsOf(node, ctx)
  const shown = fields.slice(0, CARD_ROWS)
  return (
    <div className="flex flex-col">
      {shown.map((field) => (
        <div key={field.name} className={CARD_GRID}>
          <span className="truncate font-mono text-[11px] text-slate-200">{field.name}</span>
          <span className="truncate font-mono text-[11px] text-slate-500">{labelOf(field.schema, ctx)}</span>
        </div>
      ))}
      {fields.length > shown.length && <Missing text={`и ещё ${fields.length - shown.length}`} />}
    </div>
  )
}

function CardStructure({ link }: { link: TypeLink }) {
  const structure = structureOf(link.schema, link.context)
  if (structure.shape === "values")
    return <CardValues node={structure.node} values={structure.values} ctx={link.context} />
  if (structure.shape === "fields") return <CardFields node={structure.node} ctx={link.context} />
  return <span className="font-mono text-[11px] text-slate-500">{labelOf(link.schema, link.context)}</span>
}

export function TypeCard({ type, ir }: { type: string; ir: Ir | null }) {
  const link = useTypeLink(type, ir)
  const kind = kindOf(link)
  const description = descriptionOf(link)

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 truncate font-mono text-[12px] text-sky-300">{typeHeadline(link)}</span>
        {kind !== "" && <span className="shrink-0 font-mono text-[10px] text-slate-500">{kindLabel(kind)}</span>}
      </div>
      {description !== "" && <p className="text-[11.5px] leading-relaxed text-slate-300">{description}</p>}
      {link.schema === null ? <NoSchema headline={typeHeadline(link)} /> : <CardStructure link={link} />}
      <p className="border-t border-slate-800 pt-1 text-[10.5px] text-slate-600">
        {link.schema === null ? "Клик недоступен — показывать нечего." : "Клик открывает тип целиком."}
      </p>
    </div>
  )
}

type DialogProps = { type: string; ir: Ir | null; onClose: () => void }

export function TypeDialog({ type, ir, onClose }: DialogProps) {
  const [trail, setTrail] = useState<readonly string[]>([type])
  const current = trail[trail.length - 1] ?? type

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/70 px-4 py-10 backdrop-blur-[1px]"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-[560px] max-w-full flex-col overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-2xl shadow-black/70"
      >
        <header className="flex items-center gap-1.5 border-b border-slate-800 px-3 py-2">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">тип</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1">
            {trail.map((name, index) => (
              <span key={`${name}-${index}`} className="flex items-baseline gap-1">
                {index > 0 && <span className="font-mono text-[10px] text-slate-600">›</span>}
                <button
                  type="button"
                  onClick={() => setTrail(trail.slice(0, index + 1))}
                  className={`font-mono text-[12px] ${
                    index === trail.length - 1 ? "text-slate-100" : "text-sky-400 hover:underline"
                  }`}
                >
                  {name}
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="закрыть"
            className="shrink-0 rounded px-1 font-mono text-[12px] text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
          <TypeView type={current} ir={ir} onOpen={(name) => setTrail([...trail, name])} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
