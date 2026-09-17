import { createFileRoute } from "@tanstack/react-router"
import { Demo } from "@/components/studio/-demo/demo"
import { NotFound } from "@/routes/-not-found"

export const Route = createFileRoute("/$locale/demo")({
  component: import.meta.env.DEV ? Demo : NotFound,
})
