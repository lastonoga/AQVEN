import { createFileRoute, redirect } from "@tanstack/react-router"
import { ROUTE_PATH } from "@/lib/routes"

export const Route = createFileRoute("/_project/flows/$flowId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: ROUTE_PATH.canvas, params })
  },
})
