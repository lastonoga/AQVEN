import { useState } from "react"
import type { ReactNode } from "react"
import type { InputSchema, JsonSchema } from "../api/index.js"

type Props = {
  input: InputSchema | null
  value: string
  onChange: (next: string) => void
  disabled: boolean
}

export type ParsedInput = { value: unknown; error: string | null }

export const parseInput = (text: string): ParsedInput => {
  if (text.trim().length === 0) return { value: null, error: null }
  try {
    return { value: JSON.parse(text) as unknown, error: null }
  } catch (cause) {
    return { value: undefined, error: cause instanceof Error ? cause.message : String(cause) }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const setAt = (root: unknown, path: string[], next: unknown): unknown => {
  const [head, ...rest] = path
  if (head === undefined) return next
  const base = isRecord(root) ? root : {}
  return { ...base, [head]: setAt(base[head], rest, next) }
}

const valueAt = (root: unknown, path: string[]): unknown =>
  path.reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), root)

const INPUT_CLASS =
  "w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[12px] text-slate-200 outline-none focus:border-sky-600"

type FieldProps = {
  schema: JsonSchema
  path: string[]
  value: unknown
  set: (path: string[], next: unknown) => void
  disabled: boolean
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : "")

const numberOf = (value: unknown): string => (typeof value === "number" ? String(value) : "")

function StringField({ path, value, set, disabled }: FieldProps) {
  return (
    <input
      className={INPUT_CLASS}
      disabled={disabled}
      value={textOf(value)}
      onChange={(event) => set(path, event.target.value)}
    />
  )
}

function NumberField({ path, value, set, disabled }: FieldProps) {
  return (
    <input
      className={INPUT_CLASS}
      disabled={disabled}
      inputMode="decimal"
      value={numberOf(value)}
      onChange={(event) => {
        const next = event.target.value
        if (next.trim().length === 0) return set(path, undefined)
        const parsed = Number(next)
        set(path, Number.isNaN(parsed) ? next : parsed)
      }}
    />
  )
}

function BooleanField({ path, value, set, disabled }: FieldProps) {
  return (
    <label className="flex items-center gap-2 font-mono text-[12px] text-slate-300">
      <input
        type="checkbox"
        disabled={disabled}
        checked={value === true}
        onChange={(event) => set(path, event.target.checked)}
      />
      {value === true ? "true" : "false"}
    </label>
  )
}

function EnumField({ schema, path, value, set, disabled }: FieldProps) {
  const options = schema.enum ?? []
  return (
    <select
      className={INPUT_CLASS}
      disabled={disabled}
      value={String(value ?? "")}
      onChange={(event) => {
        const picked = options.find((option) => String(option) === event.target.value)
        set(path, picked)
      }}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  )
}

function JsonField({ path, value, set, disabled }: FieldProps) {
  return (
    <textarea
      className={`${INPUT_CLASS} h-16 resize-y`}
      disabled={disabled}
      value={value === undefined ? "" : JSON.stringify(value)}
      onChange={(event) => {
        const text = event.target.value
        if (text.trim().length === 0) return set(path, undefined)
        try {
          set(path, JSON.parse(text) as unknown)
        } catch {
          set(path, text)
        }
      }}
    />
  )
}

function ObjectField({ schema, path, value, set, disabled }: FieldProps) {
  const properties = Object.entries(schema.properties ?? {})
  if (properties.length === 0) return <JsonField schema={schema} path={path} value={value} set={set} disabled={disabled} />
  return (
    <div className="flex flex-col gap-2 border-l border-slate-800 pl-3">
      {properties.map(([name, child]) => (
        <Field
          key={name}
          name={name}
          schema={child}
          path={[...path, name]}
          required={(schema.required ?? []).includes(name)}
          value={valueAt(value, [name])}
          set={set}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

const byType: Record<string, (props: FieldProps) => ReactNode> = {
  string: StringField,
  number: NumberField,
  integer: NumberField,
  boolean: BooleanField,
  object: ObjectField,
  array: JsonField,
}

function Control(props: FieldProps): ReactNode {
  if ((props.schema.enum ?? []).length > 0) return <EnumField {...props} />
  const render = byType[props.schema.type ?? ""] ?? JsonField
  return render(props)
}

type NamedFieldProps = FieldProps & { name: string; required: boolean }

function Field({ name, required, ...rest }: NamedFieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-slate-400">
        {name}
        {required && <span className="pl-1 text-red-400">*</span>}
        <span className="pl-2 text-slate-600">{rest.schema.type ?? "?"}</span>
      </span>
      {rest.schema.description !== undefined && (
        <span className="text-[11px] text-slate-500">{rest.schema.description}</span>
      )}
      <Control {...rest} />
    </label>
  )
}

function FreeformNotice({ input }: { input: InputSchema }) {
  return (
    <p className="rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-[11px] leading-relaxed text-amber-300">
      {input.note ?? "форма свободная: реестра типов ещё нет, вход принимается любым JSON"}
    </p>
  )
}

function UsedFields({ input }: { input: InputSchema }) {
  if (input.fields.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wide text-slate-600">
        поля входа, которые читает воркфлоу
      </span>
      {input.fields.map((field) => (
        <div key={field.path} className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[11px] text-slate-300">{field.path}</span>
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-600">
            {field.usedBy.map((use) => `${use.node}.${use.slot}`).join(" · ")}
          </span>
        </div>
      ))}
      {input.context.length > 0 && (
        <span className="font-mono text-[11px] text-slate-600">контекст: {input.context.join(", ")}</span>
      )}
    </div>
  )
}

export function InputForm({ input, value, onChange, disabled }: Props) {
  const schema = input?.schema ?? null
  const [mode, setMode] = useState<"fields" | "json">(schema === null ? "json" : "fields")
  const parsed = parseInput(value)

  const set = (path: string[], next: unknown): void => {
    const base = parsed.error === null ? parsed.value : {}
    onChange(JSON.stringify(setAt(base, path, next), null, 2))
  }

  const tabs: { id: "fields" | "json"; label: string; enabled: boolean }[] = [
    { id: "fields", label: "поля", enabled: schema !== null },
    { id: "json", label: "json", enabled: true },
  ]

  const showFields = mode === "fields" && schema !== null && parsed.error === null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            disabled={!tab.enabled}
            onClick={() => setMode(tab.id)}
            className={`rounded px-2 py-0.5 font-mono text-[11px] ring-1 ${
              mode === tab.id
                ? "bg-slate-800 text-slate-200 ring-slate-600"
                : "bg-slate-950 text-slate-500 ring-slate-800 disabled:opacity-40"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="pl-2 font-mono text-[11px] text-slate-600">тип входа {input?.type ?? "?"}</span>
      </div>

      {input !== null && input.freeform && <FreeformNotice input={input} />}
      {input !== null && <UsedFields input={input} />}

      {showFields && (
        <div className="max-h-64 overflow-auto">
          <ObjectField schema={schema} path={[]} value={parsed.value} set={set} disabled={disabled} />
        </div>
      )}

      {!showFields && (
        <textarea
          spellCheck={false}
          disabled={disabled}
          className={`${INPUT_CLASS} h-44 resize-y leading-relaxed`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {parsed.error !== null && <p className="font-mono text-[11px] text-red-400">json не разобран: {parsed.error}</p>}
      {parsed.error === null && <p className="font-mono text-[11px] text-slate-600">json валиден</p>}
    </div>
  )
}
