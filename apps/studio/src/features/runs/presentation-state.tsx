import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiExecutionAddress, ApiValueRef, RunId } from "@/domain"
import { ChoiceGroup, StructuredValue, ValueDisplayProvider } from "@/components/studio"
import type { OutputMedia } from "@/components/studio/media-output"
import { renderableDocument, type PresentationBatch, type PresentationResult, type PresentationSide, type PresentationTarget } from "./presentation-data"
import { FormattedDocument } from "./presentation"
import { PresentationContext, type PresentationMode } from "./presentation-context"

type Ticket = { readonly target: PresentationTarget; readonly refKey: string; readonly epoch: number }
type CacheEntry = { readonly identity: string; readonly refKey: string; readonly epoch: number }

const keyOf = ({ address, side }: PresentationTarget): string =>
  [address.node_id, address.branch_key ?? "", address.iteration ?? "", address.item_index ?? "", side].join("\u001f")

const formatterVersion = (result: PresentationResult): string =>
  "formatter_version" in result && typeof result.formatter_version === "string" ? result.formatter_version : ""

export function PresentationProvider({ runId, locale, read, children }: {
  readonly runId: RunId
  readonly locale: string
  readonly read: (runId: RunId, locale: string, targets: readonly PresentationTarget[]) => Promise<PresentationBatch>
  readonly children: ReactNode
}) {
  const [mode, setCurrentMode] = useState<PresentationMode>("formatted")
  const [epoch, setEpoch] = useState(0)
  const epochRef = useRef(0)
  const [results, setResults] = useState<ReadonlyMap<string, PresentationResult>>(() => new Map())
  const cache = useRef(new Map<string, PresentationResult>())
  const latest = useRef(new Map<string, CacheEntry>())
  const queued = useRef(new Map<string, Ticket>())
  const inFlight = useRef(new Map<string, Ticket>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMode = useCallback((next: PresentationMode) => {
    if (next === mode) return
    if (next === "formatted") {
      epochRef.current += 1
      setEpoch(epochRef.current)
    }
    setCurrentMode(next)
  }, [mode])

  const flush = useCallback(() => {
    timer.current = null
    const tickets = [...queued.current.values()]
    queued.current.clear()
    if (tickets.length === 0) return
    tickets.forEach((ticket) => inFlight.current.set(keyOf(ticket.target), ticket))
    const batches: Ticket[][] = []
    for (let index = 0; index < tickets.length; index += 100) batches.push(tickets.slice(index, index + 100))
    void Promise.all(batches.map(async (batch) => {
      try {
        const { results } = await read(runId, locale, batch.map((ticket) => ticket.target))
        const byKey = new Map(results.map((result) => [keyOf(result.target), result]))
        batch.forEach((ticket) => {
          const key = keyOf(ticket.target)
          if (inFlight.current.get(key) !== ticket) return
          const result: PresentationResult = byKey.get(key) ?? { target: ticket.target, status: "error", document: null, formatter: null, error: "Missing presentation result" }
          const identity = [runId, locale, key, ticket.refKey, result.formatter ?? "", formatterVersion(result)].join("\u001f")
          cache.current.set(identity, result)
          latest.current.set(key, { identity, refKey: ticket.refKey, epoch: ticket.epoch })
        })
      } catch (error) {
        batch.forEach((ticket) => {
          const key = keyOf(ticket.target)
          if (inFlight.current.get(key) !== ticket) return
          const identity = [runId, locale, key, ticket.refKey, "", ""].join("\u001f")
          cache.current.set(identity, { target: ticket.target, status: "error", document: null, formatter: null,
            error: error instanceof Error ? error.message : "Presentation request failed" })
          latest.current.set(key, { identity, refKey: ticket.refKey, epoch: ticket.epoch })
        })
      }
    })).finally(() => {
      tickets.forEach((ticket) => {
        const key = keyOf(ticket.target)
        if (inFlight.current.get(key) === ticket) inFlight.current.delete(key)
      })
      setResults(new Map(cache.current))
    })
  }, [runId, locale, read])

  const request = useCallback((target: PresentationTarget, refKey: string) => {
    const key = keyOf(target)
    const current = latest.current.get(key)
    if (current?.epoch === epoch && current.refKey === refKey) return
    const pending = queued.current.get(key) ?? inFlight.current.get(key)
    if (pending?.epoch === epoch && pending.refKey === refKey) return
    queued.current.set(key, { target, refKey, epoch })
    if (timer.current === null) timer.current = setTimeout(flush, 0)
  }, [flush, epoch])

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  const result = useCallback((target: PresentationTarget, refKey: string) => {
    const current = latest.current.get(keyOf(target))
    return current?.epoch === epoch && current.refKey === refKey ? results.get(current.identity) ?? null : null
  }, [results, epoch])
  return <PresentationContext value={{ mode, setMode, result, request }}>
    <ValueDisplayProvider mode={mode === "raw" ? "json" : "flat"}>{children}</ValueDisplayProvider>
  </PresentationContext>
}

export function PresentationModeChoice({ mode, onValueChange }: { readonly mode: PresentationMode; readonly onValueChange: (mode: PresentationMode) => void }) {
  const t = useTranslations("runs.presentation")
  return <ChoiceGroup appearance="segmented" size="sm" label={t("label")}
    items={[{ value: "formatted", label: t("formatted") }, { value: "raw", label: t("raw") }]}
    value={mode} onValueChange={onValueChange} />
}

export function PresentationModeSwitch() {
  const { mode, setMode } = useContext(PresentationContext)
  return <PresentationModeChoice mode={mode} onValueChange={setMode} />
}

export function PresentationValue({ address, side, value, valueRef, media = [], mediaOnly = false, compact = false, detail = false }: {
  readonly address: ApiExecutionAddress
  readonly side: PresentationSide
  readonly value: unknown
  readonly valueRef?: ApiValueRef
  readonly media?: readonly OutputMedia[]
  readonly mediaOnly?: boolean
  readonly compact?: boolean
  readonly detail?: boolean
}) {
  const t = useTranslations("runs.presentation")
  const { mode, result, request } = useContext(PresentationContext)
  const target: PresentationTarget = useMemo(() => ({ address, side }), [address, side])
  const refKey = useMemo(() => {
    const source = valueRef ?? value
    return source === undefined ? "undefined" : JSON.stringify(source)
  }, [valueRef, value])
  useEffect(() => {
    if (mode === "formatted") request(target, refKey)
  }, [mode, request, target, refKey])
  const fallback = <StructuredValue value={value} media={media} mediaOnly={mediaOnly} compact={compact} />
  if (mode === "raw") return <StructuredValue value={mediaOnly ? valueRef ?? value : value} media={media} compact={compact} />
  const selected = result(target, refKey)
  let invalidDocument = false
  if (selected?.status === "formatted") {
    const document = renderableDocument(selected.document, value, media, mediaOnly)
    if (document !== null) {
      return <FormattedDocument value={value} document={document} media={media} mediaOnly={mediaOnly} compact={compact} />
    }
    invalidDocument = true
  }
  const reason = selected?.status === "error" || invalidDocument ? t("error") : null
  return <div className="min-w-0">{detail && reason !== null ? <p className="mb-1 text-[11px] text-muted-foreground">{reason}</p> : null}{fallback}</div>
}
