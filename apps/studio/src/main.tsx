import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import { subscribeToSpecEvents } from "./features/shell/spec-live-refresh"
import { router } from "./router"
import "./styles/app.css"

const mount = (): void => {
  const container = document.getElementById("root")
  if (container === null) return
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

const unregisterLegacyMockWorker = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(
    registrations
      .filter((registration) => {
        const worker = registration.active ?? registration.waiting ?? registration.installing
        return worker !== null && new URL(worker.scriptURL).pathname === "/mockServiceWorker.js"
      })
      .map((registration) => registration.unregister()),
  )
}

void unregisterLegacyMockWorker().catch(console.error)
mount()
subscribeToSpecEvents(() => {
  void router.invalidate()
})
