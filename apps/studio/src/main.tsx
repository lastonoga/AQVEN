import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import { router } from "./router"
import "./styles/app.css"

const enableMocking = async (): Promise<void> => {
  if (import.meta.env.VITE_MOCK === "false") return
  const { worker } = await import("./mocks/browser")
  await worker.start({ onUnhandledRequest: "bypass", quiet: true })
}

const mount = (): void => {
  const container = document.getElementById("root")
  if (container === null) return
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

const reportMockingFailure = (error: unknown): void => {
  console.error(error)
}

void enableMocking().catch(reportMockingFailure).finally(mount)
