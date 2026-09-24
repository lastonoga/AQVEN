import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ServerSource } from "@/api/server"
import { ServerHealthContext, type ServerNotice } from "./context"
import { browserHost, createServerMonitor, type MonitorHost, type ServerSignal } from "./monitor"

export type ServerHealthProviderProps = {
  readonly source: ServerSource
  readonly host?: MonitorHost
  readonly children: ReactNode
}

const nextNotice = (signal: ServerSignal) => (current: ServerNotice | null): ServerNotice => ({
  signal,
  serial: (current?.serial ?? 0) + 1,
})

export function ServerHealthProvider({ source, host = browserHost, children }: ServerHealthProviderProps) {
  const [monitor] = useState(() => createServerMonitor(source, host))
  const snapshot = useSyncExternalStore(monitor.subscribe, monitor.snapshot)
  const router = useRouter()
  const [notice, setNotice] = useState<ServerNotice | null>(null)

  useEffect(
    () =>
      monitor.onSignal((signal) => {
        setNotice(nextNotice(signal))
        void router.invalidate()
      }),
    [monitor, router],
  )

  useEffect(() => monitor.start(), [monitor])

  const dismissNotice = useCallback(() => {
    setNotice(null)
  }, [])

  return (
    <ServerHealthContext.Provider value={{ snapshot, checkNow: monitor.checkNow, notice, dismissNotice }}>
      {children}
    </ServerHealthContext.Provider>
  )
}
