import { useEffect } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ApiSpecEvent } from "@/domain"
import { EMPTY_LEDGER, planRefresh, remember, touchesMatch, type PathLedger, type RefreshMatch, type RefreshPlan } from "./project-refresh"

export type ProjectEvents = (onEvent: (event: ApiSpecEvent) => void) => () => void

export const REFRESH_BATCH_MS = 300

export function useProjectRefresh(stream?: ProjectEvents): void {
  const router = useRouter()
  const subscribe = stream ?? router.options.context.api.project.events

  useEffect(() => {
    let batch: ApiSpecEvent[] = []
    let ledger: PathLedger = EMPTY_LEDGER
    let timer: ReturnType<typeof setTimeout> | null = null

    const refresh = (plan: RefreshPlan): void => {
      if (plan.everything) {
        void router.invalidate()
        return
      }
      const affected = (match: RefreshMatch): boolean => touchesMatch(plan.touches, match)
      if (!router.state.matches.some(affected)) return
      void router.invalidate({ filter: affected })
    }

    const flush = (): void => {
      timer = null
      const events = batch
      batch = []
      ledger = remember(ledger, events, Date.now())
      refresh(planRefresh(events, ledger))
    }

    const close = subscribe((event) => {
      batch.push(event)
      if (timer === null) timer = setTimeout(flush, REFRESH_BATCH_MS)
    })

    return () => {
      if (timer !== null) clearTimeout(timer)
      close()
    }
  }, [router, subscribe])
}
