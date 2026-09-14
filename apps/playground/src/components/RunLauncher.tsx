import { useEffect, useState } from "react"
import { InputForm, parseInput } from "./InputForm.js"
import { useResource } from "../hooks/use-resource.js"
import { rememberRun } from "../run/registry.js"
import { navigate, runHref } from "../routing/route.js"
import type { ApiClient, JsonSchema } from "../api/index.js"

type Props = { client: ApiClient; flowId: string }

const scalarExamples: Record<string, unknown> = {
  string: "",
  number: 0,
  integer: 0,
  boolean: false,
  array: [],
}

export const exampleOf = (schema: JsonSchema | null): unknown => {
  if (schema === null) return undefined
  if (schema.default !== undefined) return schema.default
  const first = (schema.examples ?? [])[0]
  if (first !== undefined) return first
  const enumerated = (schema.enum ?? [])[0]
  if (enumerated !== undefined) return enumerated
  if (schema.type === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([name, child]) => [name, exampleOf(child)]),
    )
  }
  return scalarExamples[schema.type ?? ""]
}

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause))

export function RunLauncher({ client, flowId }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("{}")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const input = useResource(async () => (open ? client.getInputSchema(flowId) : null), `input:${flowId}:${open}`)

  const example = input.data?.example ?? exampleOf(input.data?.schema ?? null)
  const parsed = parseInput(text)
  const blocked = busy || parsed.error !== null

  const submit = async (): Promise<void> => {
    if (blocked) return
    setBusy(true)
    setError(null)
    try {
      const runId = await client.startRun(flowId, parsed.value)
      rememberRun({ id: runId, flow: flowId, startedAt: Date.now() })
      setOpen(false)
      navigate(runHref(runId))
    } catch (cause: unknown) {
      setError(messageOf(cause))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false)
      if (event.key !== "Enter") return
      if (!event.metaKey && !event.ctrlKey) return
      void submit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded bg-sky-900 px-2.5 py-1 font-mono text-[12px] text-sky-100 ring-1 ring-sky-700 hover:bg-sky-800"
      >
        {open ? "закрыть" : "Запустить"}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[460px] rounded border border-slate-700 bg-slate-950 p-3 shadow-xl shadow-black/60">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[12px] text-slate-300">вход прогона · {flowId}</span>
            <button
              type="button"
              disabled={example === undefined}
              onClick={() => setText(JSON.stringify(example, null, 2))}
              className="rounded px-2 py-0.5 font-mono text-[11px] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-900 disabled:opacity-40"
              title={example === undefined ? "сервер не отдаёт пример входа" : "подставить пример"}
            >
              подставить пример
            </button>
          </div>

          <InputForm input={input.data} value={text} onChange={setText} disabled={busy} />

          {input.error !== null && (
            <p className="mt-2 font-mono text-[11px] text-amber-400">схема входа не пришла: {input.error}</p>
          )}
          {error !== null && <p className="mt-2 font-mono text-[11px] text-red-400">{error}</p>}

          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-slate-600">POST /api/runs · ⌘↵</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 font-mono text-[11px] text-slate-400 ring-1 ring-slate-800 hover:bg-slate-900"
              >
                отмена
              </button>
              <button
                type="button"
                disabled={blocked}
                onClick={() => void submit()}
                className="rounded bg-sky-900 px-2.5 py-1 font-mono text-[12px] text-sky-100 ring-1 ring-sky-700 hover:bg-sky-800 disabled:opacity-40"
              >
                {busy ? "запуск…" : "запустить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
