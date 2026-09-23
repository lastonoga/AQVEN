import { useEffect, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ApiRunEvent, ApiRunSnapshot } from "@/domain"
import * as ids from "@/data/ids"
import type { BlobText } from "@/features/call-sheet"
import { readRunBlobs, snapshotRefs } from "./run-blobs"
import {
  emptyOverlay,
  eventSourceStream,
  isLiveStatus,
  lastSeqOf,
  mergeBlobs,
  mergeLive,
  overlayFor,
  RUN_EVENT_EFFECT,
  type LiveOverlay,
  type RunEventEffect,
  type RunEventStream,
} from "./run-events"

export type LiveRunInput = {
  readonly snapshot: ApiRunSnapshot | null
  readonly events: readonly ApiRunEvent[]
  readonly blobs: readonly BlobText[]
}

export type LiveRun = LiveRunInput & { readonly following: boolean }

const REFRESH_DELAY_MS = 250
const NO_RUN = ""

type EffectActions = Readonly<Record<RunEventEffect, () => void>>

const withEvent = (overlay: LiveOverlay, runId: string, event: ApiRunEvent): LiveOverlay => {
  const current = overlayFor(overlay, runId)
  return { ...current, events: [...current.events, event] }
}

const withSnapshot = (overlay: LiveOverlay, runId: string, snapshot: ApiRunSnapshot, blobs: readonly BlobText[]): LiveOverlay => {
  const current = overlayFor(overlay, runId)
  return { ...current, snapshot, blobs: mergeBlobs(current.blobs, blobs) }
}

const finishedOverlay = (overlay: LiveOverlay, runId: string): LiveOverlay => ({ ...overlayFor(overlay, runId), finished: true })

const viewOf = (input: LiveRunInput, overlay: LiveOverlay): LiveRunInput => {
  if (input.snapshot === null) return input
  return mergeLive({ snapshot: input.snapshot, events: input.events, blobs: input.blobs }, overlay)
}

export function useLiveRun(input: LiveRunInput, stream: RunEventStream = eventSourceStream): LiveRun {
  const router = useRouter()
  const { api } = router.options.context
  const runId = input.snapshot?.run_id ?? NO_RUN
  const [overlay, setOverlay] = useState<LiveOverlay>(() => emptyOverlay(runId))
  const current = overlayFor(overlay, runId)
  const view = viewOf(input, current)
  const status = input.snapshot?.status ?? null
  const following = status !== null && isLiveStatus(status) && !current.finished
  const since = view.snapshot === null ? 0 : lastSeqOf(view.snapshot, view.events)
  const sinceRef = useRef(since)
  const knownBlobs = useRef(view.blobs)

  useEffect(() => {
    sinceRef.current = since
    knownBlobs.current = view.blobs
  })

  useEffect(() => {
    if (!following) return
    const id = ids.runId(runId)
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let close: () => void = () => undefined

    const refresh = async (): Promise<void> => {
      const snapshot = await api.run.snapshot(id)
      const blobs = await readRunBlobs(api.blob, snapshotRefs(snapshot), knownBlobs.current)
      if (!active) return
      setOverlay((previous) => withSnapshot(previous, runId, snapshot, blobs))
    }

    const actions: EffectActions = {
      append: () => undefined,
      refresh: () => {
        if (timer !== null) return
        timer = setTimeout(() => {
          timer = null
          void refresh().catch(() => undefined)
        }, REFRESH_DELAY_MS)
      },
      finish: () => {
        active = false
        close()
        setOverlay((previous) => finishedOverlay(previous, runId))
        void router.invalidate()
      },
    }

    close = stream(id, sinceRef.current, (event) => {
      if (!active) return
      setOverlay((previous) => withEvent(previous, runId, event))
      actions[RUN_EVENT_EFFECT[event.type]]()
    })

    return () => {
      active = false
      if (timer !== null) clearTimeout(timer)
      close()
    }
  }, [api, router, runId, following, stream])

  return { ...view, following }
}
