import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useNow, useTranslations } from "use-intl"
import type { FlowId, RunId, SeriesId } from "@/domain"
import { Dot, Heading, Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { messageOf } from "@/lib/errors"
import { addressLabel, DEADLINE, deadlineDotLabel, deadlineDuration, deadlineState, entryKey, entryReason, entryTitle, type ReviewEntry } from "./presenters"
import { WaitBody } from "./review-detail"
import { loadWaitDetail, loadWaits, type WaitDetail } from "./waits-data"

type WaitsCommon = { readonly flowId: FlowId | null; readonly onResolved?: () => void }

export type WaitsInlineProps =
  | (WaitsCommon & { readonly runId: RunId; readonly seriesId?: never })
  | (WaitsCommon & { readonly seriesId: SeriesId; readonly runId?: never })

type QueueState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly queue: readonly ReviewEntry[] }
  | { readonly kind: "failed"; readonly message: string }

type DetailState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly wait: WaitDetail }
  | { readonly kind: "failed"; readonly message: string }

type WaitRowProps = {
  readonly entry: ReviewEntry
  readonly open: boolean
  readonly onToggle: () => void
  readonly onResolved: () => void
}

const NONE_OPEN = ""

function WaitDetailLoader({ entry, onResolved }: { readonly entry: ReviewEntry; readonly onResolved: () => void }) {
  const t = useTranslations("review.inline")
  const { api } = useRouter().options.context
  const [state, setState] = useState<DetailState>({ kind: "loading" })

  useEffect(() => {
    let live = true
    void loadWaitDetail(api, entry).then(
      (wait) => {
        if (live) setState({ kind: "ready", wait })
      },
      (reason: unknown) => {
        if (live) setState({ kind: "failed", message: messageOf(reason) })
      },
    )
    return () => {
      live = false
    }
  }, [api, entry])

  if (state.kind === "loading") {
    return (
      <Text role="hint" tone="neutral" asChild>
        <div role="status" className="mt-3 flex items-center gap-2">
          <Spinner aria-hidden="true" />
          {t("loading")}
        </div>
      </Text>
    )
  }
  if (state.kind === "failed") {
    return (
      <Text role="hint" tone="destructive" asChild>
        <p role="alert" className="mt-3">
          {t("detailFailed", { reason: state.message })}
        </p>
      </Text>
    )
  }
  return <WaitBody entry={entry} wait={state.wait} onResolved={onResolved} />
}

function WaitRow({ entry, open, onToggle, onResolved }: WaitRowProps) {
  const t = useTranslations("review")
  const domain = useTranslations("domain")
  const state = deadlineState(entry.wait, useNow())
  const look = DEADLINE[state.kind]
  return (
    <Surface variant="raised" padding="md">
      <button type="button" aria-expanded={open} className="block w-full cursor-pointer text-left" onClick={onToggle}>
        <Heading
          size="item"
          titleAs="div"
          leading={<Dot tone={look.dot} {...deadlineDotLabel(state, t)} />}
          title={entryTitle(entry, t)}
          trailing={
            <Text role="tiny" tone={look.queue}>
              {deadlineDuration(state, t)}
            </Text>
          }
          below={[addressLabel(entry.wait.address), entryReason(entry, { t, domain })]}
        />
      </button>
      {open ? <WaitDetailLoader entry={entry} onResolved={onResolved} /> : null}
    </Surface>
  )
}

export function WaitsInline(props: WaitsInlineProps) {
  const t = useTranslations("review.inline")
  const common = useTranslations("common")
  const runId = props.runId ?? null
  const seriesId = props.seriesId ?? null
  const { flowId, onResolved } = props
  const { api } = useRouter().options.context
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<QueueState>({ kind: "loading" })
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void loadWaits(api, { runId, seriesId, flowId }).then(
      (queue) => {
        if (live) setState({ kind: "ready", queue })
      },
      (reason: unknown) => {
        if (live) setState({ kind: "failed", message: messageOf(reason) })
      },
    )
    return () => {
      live = false
    }
  }, [api, runId, seriesId, flowId, revision])

  const resolved = (): void => {
    setOpenKey(null)
    setRevision((current) => current + 1)
    onResolved?.()
  }

  if (state.kind === "loading") return null
  if (state.kind === "failed") {
    return (
      <section aria-label={t("labelAria")} className="flex flex-wrap items-center gap-2.5">
        <Text role="hint" tone="destructive" asChild>
          <p role="alert">{t("failed", { reason: state.message })}</p>
        </Text>
        <Button type="button" variant="outline" size="xs" onClick={() => { setRevision((current) => current + 1) }}>
          {common("retry")}
        </Button>
      </section>
    )
  }
  const first = state.queue[0]
  if (first === undefined) return null
  const current = openKey ?? entryKey(first)
  return (
    <section aria-label={t("labelAria")}>
      <Heading size="section" title={t("title")} description={t("count", { count: state.queue.length })} />
      <div className="mt-1.5 flex flex-col gap-2">
        {state.queue.map((entry) => {
          const key = entryKey(entry)
          const open = key === current
          return (
            <WaitRow
              key={key}
              entry={entry}
              open={open}
              onToggle={() => { setOpenKey(open ? NONE_OPEN : key) }}
              onResolved={resolved}
            />
          )
        })}
      </div>
    </section>
  )
}
