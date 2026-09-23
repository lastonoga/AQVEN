import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { SeriesDetail, SeriesEvent, SeriesId } from "@/domain"
import { isActive } from "./presenters"

export type SeriesLive = { readonly following: boolean }

export type SeriesEvents = (id: SeriesId, afterSeq: number, onEvent: (event: SeriesEvent) => void) => () => void

const REFRESH_DELAY_MS = 400
const FROM_START = 0

type Watched = Pick<SeriesDetail, "id" | "status">

export function useSeriesLive(series: Watched | null, stream?: SeriesEvents): SeriesLive {
  const router = useRouter()
  const subscribe = stream ?? router.options.context.api.research.events
  const [finished, setFinished] = useState<SeriesId | null>(null)
  const id = series?.id ?? null
  const following = series !== null && isActive(series.status) && finished !== series.id

  useEffect(() => {
    if (!following || id === null) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    const refresh = (): void => {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        if (active) void router.invalidate()
      }, REFRESH_DELAY_MS)
    }

    const close = subscribe(id, FROM_START, (event) => {
      if (!active) return
      if (event.kind !== "finished") {
        refresh()
        return
      }
      active = false
      setFinished(id)
      void router.invalidate()
    })

    return () => {
      active = false
      if (timer !== null) clearTimeout(timer)
      close()
    }
  }, [router, subscribe, id, following])

  return { following }
}
